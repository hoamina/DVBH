// Loi chao "phu" hien tren Dashboard - ket hop thoi tiet (Open-Meteo, khong can API key) + gio
// trong ngay (gio VN) + biet danh theo gioi tinh nguoi dung. Tinh nang trang tri, KHONG duoc lam
// vo route hay chan trang load: moi loi (mang, timeout, parse JSON hong) deu nuot va tra null
// thay vi throw - phia goi se an ca banner.

type Region = "bac" | "nam";

const REGION_COORDS: Record<Region, { lat: number; lon: number; city: string }> = {
  bac: { lat: 21.0285, lon: 105.8542, city: "Hà Nội" },
  nam: { lat: 10.8231, lon: 106.6297, city: "TP. Hồ Chí Minh" },
};

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Uu tien tu khoa "bac"/"nam" trong ten hien thi cua khu_vuc_phu_trach (chi vai tro "Giam sat" co
// gan du lieu nay - cac vai tro khac mang rong, mac dinh ve Bac), cong them ma vung dang
// "(qldvbh.mb2)"/"(qldvbh.mn1)" (tien to mb/mn sau dau cham cuoi) vi nhieu gia tri thuc te chi co
// dang ma nay, khong co chu "Bac"/"Nam" ro rang. Dem so phieu ca 2 nguon, ben nao nhieu hon thang;
// hoa hoac rong -> Bac.
export function inferRegion(khuVucPhuTrach: string[]): Region {
  let bac = 0;
  let nam = 0;
  for (const raw of khuVucPhuTrach) {
    const word = stripDiacritics(raw).toLowerCase();
    if (word.includes("bac")) bac++;
    if (word.includes("nam")) nam++;

    const codeMatch = raw.match(/\(([^)]+)\)/);
    const lastSeg = (codeMatch ? codeMatch[1] : "").toLowerCase().split(".").pop() ?? "";
    if (lastSeg.startsWith("mb")) bac++;
    if (lastSeg.startsWith("mn")) nam++;
  }
  return nam > bac ? "nam" : "bac";
}

export interface WeatherInfo {
  city: string;
  tempC: number;
  isHot: boolean;
  isCold: boolean;
  isRain: boolean;
  isFog: boolean;
}

const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);
const FOG_CODES = new Set([45, 48]);

type OpenMeteoResponse = { current?: { temperature_2m?: number; weather_code?: number } };

function toWeatherInfo(city: string, data: OpenMeteoResponse): WeatherInfo | null {
  const tempC = data.current?.temperature_2m;
  const code = data.current?.weather_code;
  if (typeof tempC !== "number" || typeof code !== "number") return null;
  return {
    city,
    tempC,
    isHot: tempC >= 33,
    isCold: tempC <= 20,
    isRain: RAIN_CODES.has(code),
    isFog: FOG_CODES.has(code),
  };
}

// Chi 2 vung co the (bac/nam) va thoi tiet khong doi nhanh trong vai chuc phut - dung Cache API
// cua Cloudflare (edge cache, khong can KV/D1 rieng) de tranh goi Open-Meteo tren MOI request
// /api/greeting (truoc day goi 1 lan/nguoi/lan tai trang, ton tai nguyen + rui ro timeout 4s).
export async function fetchWeather(region: Region): Promise<WeatherInfo | null> {
  const { lat, lon, city } = REGION_COORDS[region];
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=Asia%2FBangkok`;
  const cacheKey = new Request(url);
  const cache = caches.default;

  try {
    const cached = await cache.match(cacheKey);
    if (cached) return toWeatherInfo(city, (await cached.json()) as OpenMeteoResponse);

    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const data = (await res.json()) as OpenMeteoResponse;
    const info = toWeatherInfo(city, data);
    if (info) {
      await cache.put(
        cacheKey,
        new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", "Cache-Control": "max-age=1800" } }),
      );
    }
    return info;
  } catch {
    return null;
  }
}

export type TimeOfDay = "sang_som" | "sang" | "trua" | "chieu" | "toi" | "khuya";

export function currentVnHour(): number {
  return new Date(Date.now() + 7 * 3600 * 1000).getUTCHours();
}

export function timeOfDay(hourVN: number): TimeOfDay {
  if (hourVN >= 5 && hourVN < 7) return "sang_som";
  if (hourVN >= 7 && hourVN < 10) return "sang";
  if (hourVN >= 10 && hourVN < 13) return "trua";
  if (hourVN >= 13 && hourVN < 17) return "chieu";
  if (hourVN >= 17 && hourVN < 21) return "toi";
  return "khuya";
}

// "Cach goi" ghep ngay sau ten trong loi chao (vd "Chao Thai sieu nhan, ..."). Nhom "chung" hop
// voi moi gioi tinh; nhom "nam"/"nu" chi cong them khi da xac dinh gioi tinh tuong ung - xem
// pickEpithet() va quy tac o GioiTinh trong types.ts.
const EPITHETS_CHUNG = [
  "siêu nhân",
  "cute",
  "hiền lành",
  "hạnh phúc",
  "đại gia",
  "đại ka",
  "lầy lội",
  "hài hước",
  "vui tính",
  "chăm chỉ",
  "tài giỏi",
  "tốt bụng",
  "năng động",
  "đáng yêu",
  "số hưởng",
  "máu lửa",
  "nhiệt huyết",
  "chất chơi",
];
const EPITHETS_NAM = ["đẹp trai", "đập trai", "ga lăng", "công tử", "phong độ", "lịch lãm", "soái ca", "bảnh bao", "manly"];
const EPITHETS_NU = ["xinh xắn", "xinh gái", "dễ thương", "ngọt ngào", "đẹp gái", "duyên dáng", "dịu dàng", "xinh đẹp", "nữ hoàng"];

export function pickEpithet(gioiTinh: "nam" | "nu" | null | undefined): string {
  const pool = gioiTinh === "nam" ? [...EPITHETS_CHUNG, ...EPITHETS_NAM] : gioiTinh === "nu" ? [...EPITHETS_CHUNG, ...EPITHETS_NU] : EPITHETS_CHUNG;
  return pick(pool);
}

// 30 bien the moi khung gio, tron lan ca loi chao lan cau dong vien, de random ra khong bi lap lai
// nham chan qua nhieu lan ghe web.
const TIME_TEMPLATES: Record<TimeOfDay, string[]> = {
  sang_som: [
    "Dậy sớm thế, hôm nay chắc năng suất lắm đây 🌅",
    "Sáng sớm rồi, làm cốc trà nóng cho tỉnh táo bạn nhé 🍵",
    "Ngày mới đến rồi, dậy sớm vậy chắc hôm nay nhiều việc hay ho lắm đây.",
    "Trời còn sớm mà bạn đã online rồi, chăm chỉ quá đó nha 👏",
    "Buổi sáng sớm yên tĩnh thế này làm việc dễ tập trung lắm, cố lên nhé!",
    "Buổi sớm mai bình yên quá, một ngày mới tràn đầy năng lượng nào 💪",
    "Sáng sớm tinh mơ, chúc bạn một ngày mới nhiều điều thuận lợi nhé!",
    "Dậy sớm thế này, nhất định hôm nay sẽ là một ngày suôn sẻ đây ✨",
    "Ngày mới bắt đầu rồi, hít thở sâu một cái rồi bắt đầu thôi nào!",
    "Buổi sáng sớm mà đã vào làm rồi, đúng là người chăm chỉ chính hiệu 🌤️",
    "Bình minh đẹp quá, mong hôm nay mọi việc của bạn đều thuận buồm xuôi gió.",
    "Gà chưa gáy mà bạn đã dậy rồi, sáng sớm thế này chắc có kế hoạch gì hay đây!",
    "Sương sớm còn vương trên lá, chúc bạn một buổi sáng thật nhẹ nhàng nhé.",
    "Dậy đúng giờ vàng để làm việc đó, chúc bạn một ngày thật hiệu quả!",
    "Sáng sớm này yên tĩnh ghê, tranh thủ lên kế hoạch cho cả ngày nhé bạn.",
    "Bình minh vừa ló dạng, năng lượng mới cũng bắt đầu từ đây luôn nè!",
    "Dậy sớm để đón nắng mai, chúc bạn một ngày tràn đầy hứng khởi nhé!",
    "Buổi sáng sớm trong lành thế này, hít một hơi thật sâu rồi bắt đầu thôi!",
    "Sáng sớm mà đã tinh thần thế này, cả ngày chắc chắn sẽ rất ổn đây!",
    "Ngày mới vừa hé rạng, chúc bạn khởi đầu thật suôn sẻ nhé!",
    "Dậy sớm vậy chắc tối qua ngủ ngon lắm, chúc một ngày mới tràn năng lượng!",
    "Trời vừa sáng, cả thành phố còn đang ngái ngủ mà bạn đã sẵn sàng rồi!",
    "Buổi sớm mai trong trẻo, một khởi đầu đẹp cho một ngày dài phía trước.",
    "Sáng sớm này chắc yên tĩnh lắm nhỉ, tranh thủ tập trung làm việc nha!",
    "Ánh nắng đầu ngày vừa lên, chúc bạn một buổi sáng thật rực rỡ nhé!",
    "Dậy sớm là cả một nghệ thuật đó, chúc mừng bạn đã làm được hôm nay!",
    "Sáng sớm tĩnh lặng thế này, đúng là thời điểm vàng để tập trung cao độ.",
    "Buổi sáng sớm mai, chúc bạn giữ được năng lượng này đến cuối ngày nhé!",
    "Trời mới hửng sáng, chúc bạn một ngày mới nhiều điều tốt lành nhé.",
    "Dậy sớm thế này, chắc chắn bạn sẽ hoàn thành được nhiều việc hôm nay đó!",
  ],
  sang: [
    "Buổi sáng rồi, làm cốc cà phê chưa bạn hiền? ☕",
    "Sáng rồi, ăn sáng chưa đó, đừng bỏ bữa nha 🍳",
    "Buổi sáng vui vẻ! Chúc bạn một ngày làm việc năng suất 💪",
    "Goodmorning! Hôm nay có gì hay ho không bạn ơi?",
    "Sáng nay trông bạn có vẻ đầy năng lượng đó, cố lên nhé!",
    "Buổi sáng tốt lành, bắt đầu ngày mới với tâm trạng thật tốt nào 😊",
    "Cà phê sáng làm rồi thì mình bắt tay vào việc thôi bạn ơi!",
    "Một buổi sáng mới, một cơ hội mới - chúc bạn nhiều may mắn hôm nay!",
    "Sáng rồi đó, đừng quên ăn sáng đầy đủ để có sức làm việc cả ngày nhé 🍞",
    "Buổi sáng năng động quá, hôm nay chắc lại có nhiều việc hay đây.",
    "Ngày mới, năng lượng mới - cố lên bạn nhé, mọi việc rồi sẽ suôn sẻ thôi!",
    "Sáng nay trời đẹp không bạn? Chúc bạn khởi đầu ngày mới thật vui vẻ 🌞",
    "Buổi sáng tốt lành! Tin rằng hôm nay bạn sẽ hoàn thành thật tốt mọi việc.",
    "Sáng nay đã lên danh sách việc cần làm chưa bạn? Bắt tay vào thôi nào!",
    "Buổi sáng là lúc năng lượng dồi dào nhất đó, tranh thủ làm việc quan trọng nha!",
    "Chúc bạn buổi sáng tràn đầy cảm hứng và nhiều ý tưởng hay ho nhé!",
    "Sáng nay có tin vui gì không bạn? Kể mình nghe với nào!",
    "Một sáng mới lại đến, hãy bắt đầu bằng nụ cười thật tươi nhé bạn ơi!",
    "Buổi sáng thế này mà uống thêm ly nước cam thì sảng khoái phải biết!",
    "Sáng nay làm việc hăng say vào, cuối tuần sắp tới rồi đó nha!",
    "Buổi sáng tràn năng lượng, mong công việc hôm nay của bạn suôn sẻ nhé!",
    "Sáng sớm mà tinh thần đã lên cao thế này, hôm nay chắc thắng lớn đây!",
    "Buổi sáng trôi qua nhanh lắm, tranh thủ giải quyết việc quan trọng trước nhé.",
    "Ngày mới lại bắt đầu, chúc bạn giữ vững phong độ như mọi khi nhé!",
    "Sáng nay trông tinh thần bạn phơi phới ghê, chúc giữ được cả ngày luôn!",
    "Buổi sáng đầy nắng ấm, mong mọi kế hoạch hôm nay đều suôn sẻ với bạn.",
    "Sáng rồi đó, đứng dậy vươn vai một cái cho tỉnh táo rồi làm việc nào!",
    "Chúc bạn buổi sáng nhẹ nhàng, công việc trôi chảy như dòng nước vậy!",
    "Một ngày mới, một trang mới - chúc bạn viết nên câu chuyện thật đẹp nhé!",
    "Sáng nay có deadline gì không bạn? Cố lên, mọi thứ rồi sẽ ổn thôi!",
  ],
  trua: [
    "Trưa nay bạn ăn gì đấy? 🍜",
    "Giờ ăn trưa rồi, nhớ nghỉ ngơi chút cho lại sức nha 😌",
    "Trưa rồi, đói chưa? Tranh thủ ăn uống đầy đủ bạn nhé!",
    "Buổi sáng làm việc chăm chỉ rồi, giờ nghỉ trưa ăn ngon nha bạn 🍱",
    "Trưa nắng thế này nhớ ăn uống đủ chất để chiều còn sức làm việc nhé!",
    "Đến giờ cơm trưa rồi đó, đừng làm việc quên ăn nha bạn hiền!",
    "Nửa ngày trôi qua rồi, cố gắng của bạn buổi sáng thật đáng khen 👏 Giờ nghỉ ngơi thôi!",
    "Trưa rồi, chợp mắt chút cho tỉnh táo buổi chiều nhé!",
    "Ăn trưa xong nhớ nghỉ ngơi một chút trước khi làm tiếp nha, đừng vội quá!",
    "Giữa ngày rồi đó, bạn đang làm rất tốt, tiếp tục phát huy nhé! 💪",
    "Buổi trưa rồi, tranh thủ nạp năng lượng để chiều còn chiến tiếp bạn ơi!",
    "Trưa nay ăn gì cho lạ miệng chưa bạn? Đổi món cho đỡ ngán nhé!",
    "Giờ nghỉ trưa quý giá lắm đấy, tranh thủ chợp mắt 15 phút cho khỏe nha.",
    "Trưa rồi, nhớ rời màn hình máy tính một lúc để mắt được nghỉ ngơi nhé!",
    "Nắng trưa gay gắt lắm, ăn xong thì tranh thủ nghỉ trong bóng mát bạn nhé.",
    "Bữa trưa đủ chất mới đủ sức chiến đấu buổi chiều đó, ăn no vào nha!",
    "Trưa rồi, đừng để công việc cuốn đi mà quên mất bữa ăn quan trọng này nhé.",
    "Giữa trưa nắng nóng, làm ly nước mát giải nhiệt cũng hay đó bạn ơi 🥤",
    "Ăn trưa xong đi dạo vài bước cho tiêu cơm cũng tốt cho sức khỏe đấy!",
    "Trưa nay có hẹn ăn cùng đồng nghiệp không bạn? Vui vẻ nhé!",
    "Giờ này chắc bụng đang réo rồi, tranh thủ ăn trưa cho đúng giờ nha bạn!",
    "Buổi trưa là lúc để nạp lại năng lượng, đừng bỏ qua bạn nhé!",
    "Trưa rồi, làm một giấc ngủ ngắn sẽ giúp buổi chiều tỉnh táo hơn nhiều đấy.",
    "Nửa chặng đường của ngày đã qua, chúc mừng bạn đã cố gắng hết mình!",
    "Trưa nay nhớ ăn đủ rau xanh cho cân bằng dinh dưỡng nha bạn hiền.",
    "Giờ ăn trưa đến rồi, gác lại công việc một chút để thư giãn nhé!",
    "Buổi trưa oi bức thế này, chọn chỗ mát mẻ để dùng bữa cho thoải mái bạn nhé.",
    "Trưa rồi, húp bát canh nóng cũng đủ ấm bụng và tỉnh táo lại đấy!",
    "Giờ nghỉ trưa là để nạp lại pin đó, đừng tiếc thời gian nghỉ ngơi nha!",
    "Trưa nay dù bận đến mấy cũng nhớ dành 30 phút ăn uống tử tế nhé bạn!",
  ],
  chieu: [
    "Chiều muộn rồi, cố lên chút nữa thôi bạn ơi ☕",
    "Buổi chiều vui vẻ! Làm thêm ly trà đá cho tỉnh táo nhé.",
    "Chiều nay có gì vui không bạn? Sắp hết ngày rồi, cố lên nào!",
    "Chiều rồi, hơi mệt đúng không? Nghỉ tay 5 phút rồi làm tiếp nhé 😊",
    "Buổi chiều là lúc dễ buồn ngủ nhất đấy, tỉnh táo lên bạn ơi!",
    "Còn vài tiếng nữa là hết ngày rồi, cố thêm chút nữa thôi nào 💪",
    "Chiều nay chắc bạn đã xử lý được kha khá việc rồi đúng không? Giỏi quá!",
    "Trời chiều rồi đó, tranh thủ hoàn thành nốt công việc rồi nghỉ ngơi nhé.",
    "Buổi chiều dài thật, nhưng bạn sắp về đích rồi, cố lên!",
    "Chiều muộn mà vẫn chăm chỉ làm việc, bạn giỏi lắm đó! 👍",
    "Nắng chiều nhẹ nhàng rồi, tranh thủ làm nốt việc rồi thư giãn nhé bạn.",
    "Chiều rồi, làm tách cà phê thứ 2 trong ngày để tỉnh táo tiếp nhé!",
    "Buổi chiều trôi chậm ghê, nhưng cố lên, sắp đến giờ tan làm rồi!",
    "Chiều nay công việc có suôn sẻ không bạn? Còn gì khó thì hỏi ngay nha!",
    "Ánh nắng chiều dịu dàng hơn sáng rồi đó, tranh thủ ra ngoài hít thở chút nhé.",
    "Chiều muộn thế này dễ mỏi mắt lắm, nhớ chớp mắt và nghỉ ngơi một chút nha.",
    "Còn chút nữa là hết giờ làm rồi, dồn hết sức cho chặng cuối nào bạn ơi!",
    "Chiều nay nếu mệt thì đứng dậy vươn vai, đi lại vài bước cho tỉnh táo nhé.",
    "Buổi chiều là lúc thử thách sự kiên trì đấy, cố lên bạn nhé!",
    "Chiều rồi, sắp được nghỉ ngơi sau một ngày dài rồi, ráng thêm chút nữa!",
    "Nắng chiều nhạt dần, một ngày làm việc của bạn cũng sắp khép lại rồi.",
    "Chiều nay có deadline gấp không bạn? Tập trung cao độ, mọi việc sẽ ổn thôi!",
    "Buổi chiều dễ chán nản lắm, nghe bản nhạc yêu thích cũng giúp tỉnh táo hơn đó.",
    "Chiều muộn rồi, uống thêm ngụm nước cho tỉnh táo trước khi làm tiếp nhé.",
    "Ngày dài sắp qua rồi, buổi chiều này bạn đã cố gắng rất nhiều đó!",
    "Chiều nay trời có vẻ dịu hơn trưa rồi, tranh thủ hoàn thành nốt việc bạn nhé.",
    "Sắp hết giờ làm rồi, cố lên nốt chặng cuối này thôi bạn ơi 💪",
    "Chiều muộn dễ mệt mỏi, nhớ giữ tinh thần lạc quan để về đích nhé!",
    "Buổi chiều nắng nhạt, chúc bạn hoàn thành công việc còn lại thật suôn sẻ.",
    "Chiều nay chắc bạn đã rất nỗ lực rồi, chuẩn bị tinh thần nghỉ ngơi thôi nào!",
  ],
  toi: [
    "Buổi tối vui vẻ! Bạn đã ăn cơm tối chưa? 🍚",
    "Tối rồi, tan làm thì nhớ nghỉ ngơi nhé!",
    "Buổi tối rồi đây, hôm nay vất vả rồi, thư giãn thôi nào 🌙",
    "Một ngày làm việc nữa đã kết thúc, bạn đã làm rất tốt hôm nay đó! 👏",
    "Tối rồi, ăn uống đầy đủ rồi dành thời gian cho bản thân chút nhé.",
    "Buổi tối bình yên, chúc bạn có khoảng thời gian thư giãn thật thoải mái!",
    "Hết một ngày dài rồi, cảm ơn bạn vì đã cố gắng nhé, nghỉ ngơi thôi!",
    "Tối nay có gì vui không bạn? Nhớ dành thời gian cho gia đình nữa nha.",
    "Ăn cơm tối chưa đấy? Đừng để bụng đói mà làm việc tiếp nha!",
    "Ngày hôm nay khép lại rồi, bạn đã hoàn thành thật tốt, tự thưởng cho mình một chút nhé 🎉",
    "Buổi tối bình yên, mai lại là một ngày mới, tối nay cứ thư giãn thật thoải mái nhé.",
    "Tối nay xem phim gì thư giãn không bạn? Nghỉ ngơi cho lại sức nhé!",
    "Sau một ngày dài, buổi tối là lúc để chăm sóc bản thân đấy bạn ơi.",
    "Tối rồi, gác điện thoại công việc qua một bên, thư giãn cùng gia đình nhé.",
    "Buổi tối yên bình, chúc bạn có bữa cơm ấm cúng bên người thân nhé!",
    "Một ngày nữa trôi qua, bạn đã cố gắng rất nhiều rồi, tự hào về bản thân nhé!",
    "Tối nay đi dạo một vòng cho thư giãn đầu óc cũng hay đó bạn ơi.",
    "Ăn tối xong rồi thì nghỉ ngơi thôi, đừng ôm việc về nhà làm tiếp nha!",
    "Buổi tối là lúc nạp lại năng lượng cho ngày mai đó, ngủ đủ giấc nhé bạn.",
    "Tối nay trời có mát không bạn? Tranh thủ ra ban công hóng gió cũng dễ chịu đấy.",
    "Hết giờ làm rồi, đổi bộ đồ thoải mái và thư giãn thôi bạn ơi!",
    "Buổi tối ấm áp, chúc bạn có những giây phút bình yên bên gia đình nhé.",
    "Tối nay nhớ dành chút thời gian đọc sách hoặc nghe nhạc thư giãn nha.",
    "Ngày làm việc đã xong, giờ là lúc để tận hưởng buổi tối của riêng bạn rồi!",
    "Ăn tối no bụng rồi thì đi ngủ sớm cho khỏe, mai còn nhiều việc nữa đó bạn.",
    "Buổi tối này chúc bạn ngủ ngon và mơ những giấc mơ thật đẹp nhé.",
    "Tối rồi, tắt bớt màn hình điện thoại, cho mắt được nghỉ ngơi bạn nhé.",
    "Một ngày trọn vẹn đã khép lại, cảm ơn bạn đã nỗ lực hết mình hôm nay!",
    "Buổi tối mát mẻ thế này, cùng người thân đi dạo một vòng cũng thú vị đấy.",
    "Tối nay nhớ chuẩn bị đồ cho ngày mai trước khi đi ngủ nhé bạn hiền!",
  ],
  khuya: [
    "Khuya rồi đấy, làm việc gì thì nhớ giữ sức khỏe nha 🌃",
    "Đêm khuya rồi, ngủ sớm cho khỏe bạn nhé 😴",
    "Còn thức khuya thế này à, cố gắng đừng thức quá muộn nhé!",
    "Khuya rồi mà vẫn online, chăm chỉ ghê, nhưng nhớ giữ sức khỏe là quan trọng nhất nha!",
    "Đêm hôm rồi, việc gì để mai làm tiếp cũng được, ngủ sớm bạn ơi 💤",
    "Trời khuya lắm rồi, nghỉ ngơi thôi để mai còn nhiều năng lượng làm việc nhé!",
    "Thức khuya không tốt cho sức khỏe đâu, tranh thủ đi ngủ sớm bạn nhé!",
    "Cả thành phố đang ngủ mà bạn vẫn thức, chắc có việc quan trọng lắm đây, cố lên rồi nghỉ sớm nhé!",
    "Khuya rồi, chúc bạn ngủ ngon và có giấc mơ thật đẹp nhé 🌙",
    "Đêm khuya thanh vắng thế này làm việc dễ tập trung, nhưng nhớ đừng thức quá khuya nha.",
    "Khuya rồi, mắt chắc cũng mỏi lắm rồi, nghỉ ngơi thôi bạn ơi 😪",
    "Đêm hôm khuya khoắt, nhớ tắt đèn ngủ sớm để giữ sức khỏe nhé bạn.",
    "Khuya thế này mà vẫn thức, chắc có deadline gấp lắm đây, cố lên rồi nghỉ sớm nhé!",
    "Đêm về khuya, không khí cũng dịu đi nhiều, tranh thủ chợp mắt bạn nhé.",
    "Khuya rồi, mai dậy sớm làm tiếp cũng không sao, sức khỏe quan trọng hơn đó bạn.",
    "Đêm khuya lành lạnh, nhớ đắp chăn ấm khi đi ngủ nha bạn hiền.",
    "Khuya khoắt thế này, uống ly sữa ấm cho dễ ngủ cũng hay đó bạn ơi 🥛",
    "Đêm nay chắc yên tĩnh lắm, nhưng đã đến giờ nên nghỉ ngơi rồi bạn nhé.",
    "Khuya rồi, thức khuya nhiều dễ ảnh hưởng sức khỏe lâu dài lắm đó bạn.",
    "Đêm hôm khuya khoắt vậy, tắt bớt ánh sáng xanh từ màn hình để dễ ngủ hơn nhé.",
    "Khuya lắm rồi đấy, chúc bạn có một giấc ngủ thật sâu và ngon nhé!",
    "Đêm về khuya, công việc để mai làm tiếp cũng kịp mà, nghỉ ngơi thôi bạn ơi.",
    "Khuya khoắt thế này mà vẫn miệt mài, đúng là tinh thần trách nhiệm cao đó bạn!",
    "Đêm khuya, phố xá cũng vắng lặng rồi, đây là lúc nên nghỉ ngơi đó bạn nhé.",
    "Khuya rồi, nếu không phải việc gấp thì nên đi ngủ sớm bạn nhé, mai còn dài.",
    "Đêm hôm rồi, chúc bạn một giấc ngủ ngon để mai tràn đầy năng lượng nhé!",
    "Khuya khoắt vậy mà vẫn cố gắng, nể phục tinh thần của bạn ghê đó!",
    "Đêm về khuya lạnh hơn ban ngày, nhớ đắp chăn kỹ khi ngủ nha bạn.",
    "Khuya rồi, dành 5 phút thư giãn đầu óc trước khi chìm vào giấc ngủ nhé.",
    "Đêm khuya thanh tịnh, chúc bạn ngủ thật ngon và có ngày mai tuyệt vời nhé 🌙",
  ],
};

// 20 bien the moi loai thoi tiet cho da dang.
function weatherRemarks(w: WeatherInfo): string[] {
  const t = Math.round(w.tempC);
  if (w.isRain) {
    return [
      `Trời ${w.city} đang mưa đấy, nhớ mang ô hoặc áo mưa khi ra ngoài nhé ☔`,
      `Có mưa rồi, đi đường cẩn thận kẻo trơn trượt nha!`,
      `Mưa thế này nhớ mang theo áo mưa, đừng để ướt nhé 🌧️`,
      `Trời đang mưa ở ${w.city}, ra ngoài nhớ che chắn xe cộ và đồ đạc cẩn thận nhé!`,
      `Mưa rồi đó, nếu không cần thiết thì tranh thủ ở trong nhà cho ấm áp nha bạn.`,
      `Ngoài trời đang mưa, nhớ mang ô để không bị cảm lạnh nhé!`,
      `Mưa gió thế này, đi lại nhớ cẩn thận, chú ý an toàn bạn nhé 🌂`,
      `Nghe mưa rơi cũng hay đấy, nhưng ra đường thì nhớ mang ô nha!`,
      `Trời mưa thế này, nhớ đi chậm lại một chút cho an toàn nhé.`,
      `Mưa dầm thế này dễ làm ướt giày lắm, nhớ chuẩn bị trước bạn nhé!`,
      `Trời đổ mưa rồi, đồ điện tử mang theo nhớ bọc kỹ kẻo ướt nha.`,
      `Mưa to thế này, ra đường nhớ mặc áo mưa cho kín đáo nhé!`,
      `Ngày mưa hơi buồn nhưng cũng mát mẻ, nhớ mang ô phòng khi cần bạn nhé ☂️`,
      `Trời mưa lất phất, nhớ mang theo áo khoác mỏng chống ướt nha!`,
      `Mưa rơi tí tách ngoài kia, nhớ cẩn thận đường trơn khi di chuyển nhé.`,
      `Trời ${w.city} mưa rồi, tranh thủ nhâm nhi tách trà nóng khi rảnh cũng hay đó!`,
      `Ra đường mùa mưa nhớ kiểm tra ô trước khi đi cho chắc ăn nha bạn!`,
      `Mưa gió vậy nhớ chạy xe chậm, giữ khoảng cách an toàn bạn nhé.`,
      `Trời mưa làm mọi thứ chậm lại một chút, tranh thủ nghỉ ngơi cũng tốt bạn ơi.`,
      `Mưa thế này nhớ đội mũ bảo hiểm có kính chắn cho đỡ ướt mặt nhé!`,
    ];
  }
  if (w.isHot) {
    return [
      `Trời ${w.city} đang nắng nóng ${t}°C, ra ngoài nhớ đội mũ và mang theo nước nhé 🧢☀️`,
      `Nóng thế này, nhớ uống đủ nước kẻo say nắng đó!`,
      `${t}°C rồi, nắng gắt lắm, che chắn cẩn thận khi ra đường nha.`,
      `Trời nắng nóng, nhớ đội mũ, đeo khẩu trang chống nắng khi ra ngoài nhé!`,
      `Nắng nóng thế này dễ mệt lắm, nhớ nghỉ ngơi và uống nước thường xuyên nha.`,
      `${t}°C ngoài trời rồi, hạn chế ra ngoài giữa trưa nếu không cần thiết bạn nhé.`,
      `Nóng quá, nhớ giữ sức khỏe, đừng để say nắng nha bạn hiền!`,
      `Trời nắng chang chang thế này, nhớ thoa kem chống nắng trước khi ra đường nhé!`,
      `${t}°C rồi đó, nhớ mang theo chai nước để bổ sung liên tục nha.`,
      `Nắng nóng dễ mất nước lắm, tranh thủ uống nước thường xuyên bạn nhé.`,
      `Trời nắng gắt quá, hạn chế vận động mạnh ngoài trời giữa trưa nha!`,
      `Nóng như vậy, nhớ mặc đồ thoáng mát và uống đủ nước bạn nhé ☀️`,
      `${t}°C, nắng nóng đỉnh điểm rồi, tìm chỗ mát để nghỉ ngơi nếu có thể nhé!`,
      `Trời nắng thế này, nhớ đeo kính râm bảo vệ mắt khi ra ngoài nha.`,
      `Nắng nóng làm da dễ cháy nắng lắm, nhớ che chắn kỹ trước khi ra đường!`,
      `${t}°C rồi, nhớ tránh phơi nắng lâu, dễ mệt và say nắng lắm đó.`,
      `Trời oi bức thế này, nhớ bật quạt hoặc điều hòa để làm việc thoải mái hơn nhé.`,
      `Nắng nóng gay gắt, nhớ chuẩn bị khăn lạnh và nước mát khi ra ngoài nha!`,
      `${t}°C ngoài trời, chọn giờ mát hơn để di chuyển nếu công việc cho phép nhé.`,
      `Nóng vậy mà vẫn phải làm việc, cố lên và nhớ giữ mát cho cơ thể nha!`,
    ];
  }
  if (w.isCold) {
    return [
      `Trời ${w.city} se lạnh ${t}°C đấy, nhớ mặc ấm khi ra ngoài nhé 🧣`,
      `Hơi lạnh đó, khoác thêm áo cho ấm bạn nhé.`,
      `Lạnh thế này nhớ giữ ấm cơ thể nha!`,
      `Trời lạnh, nhớ mặc thêm áo khoác và giữ ấm cổ họng để không bị cảm nhé!`,
      `${t}°C rồi, hơi se lạnh đó, uống chút gì ấm cho khỏe bạn nhé ☕`,
      `Thời tiết lạnh dễ bị cảm, nhớ giữ ấm và ăn uống đầy đủ nha!`,
      `Trời lạnh thế này, nhớ quàng khăn giữ ấm cổ khi ra ngoài nhé.`,
      `${t}°C rồi, hơi lạnh đó, nhớ đi tất ấm chân cho khỏe bạn nhé.`,
      `Lạnh vậy thì làm ly trà gừng ấm bụng cũng hay đó bạn ơi!`,
      `Trời trở lạnh, nhớ mặc thêm lớp áo giữ nhiệt bên trong nha.`,
      `${t}°C, khá lạnh đấy, nhớ đội mũ len giữ ấm đầu khi ra ngoài nhé.`,
      `Lạnh thế này dễ bị cảm cúm lắm, nhớ giữ ấm và nghỉ ngơi đầy đủ nha!`,
      `Trời lạnh, nhớ uống nước ấm thay vì nước lạnh cho dễ chịu bạn nhé.`,
      `${t}°C rồi, gió lạnh đó, nhớ mặc áo khoác dày khi ra đường nha.`,
      `Lạnh vậy nhớ giữ ấm bàn tay, dễ bị tê cóng lắm đó bạn ơi!`,
      `Trời se lạnh làm việc cũng dễ buồn ngủ hơn, tỉnh táo lên bạn nhé.`,
      `${t}°C, lạnh kiểu này nhớ đóng kín cửa sổ tránh gió lùa nha.`,
      `Lạnh thế này, ăn uống đầy đủ để có năng lượng giữ ấm cơ thể nhé!`,
      `Trời lạnh, nhớ mang theo áo khoác dự phòng khi ra ngoài cả ngày nha.`,
      `${t}°C rồi, khá lạnh đó, chúc bạn giữ ấm và có ngày làm việc thật tốt nhé!`,
    ];
  }
  if (w.isFog) {
    return [
      `Trời ${w.city} có sương mù, đi đường chú ý tầm nhìn nhé 🌫️`,
      `Sương mù dày đặc đó, ra đường nhớ bật đèn và đi chậm cẩn thận nhé!`,
      `Trời mù sương thế này, chú ý an toàn khi di chuyển bạn nhé.`,
      `Sương mù giăng khắp nơi, nhớ đi chậm và giữ khoảng cách an toàn nhé.`,
      `Trời mù mịt sương thế này, bật đèn xe cho dễ quan sát bạn nhé!`,
      `Sương mù làm tầm nhìn hạn chế lắm, nhớ cẩn thận khi qua đường nha.`,
      `Trời ${w.city} sương mù dày, nên đi chậm hơn bình thường một chút bạn nhé.`,
      `Sương sớm phủ kín, ra đường nhớ mặc thêm áo vì khá ẩm và se lạnh đó.`,
      `Trời mờ sương thế này, chú ý biển báo và người đi đường xung quanh nhé!`,
      `Sương mù buổi sáng thường tan dần, tạm thời cứ đi chậm cho an toàn bạn nhé.`,
      `Trời sương mù dễ làm đường trơn, nhớ đi cẩn thận nha bạn hiền!`,
      `Sương giăng mờ ảo vậy cũng đẹp, nhưng nhớ an toàn là trên hết nhé.`,
      `Trời mù sương, nhớ lau kính chắn gió cho rõ tầm nhìn khi lái xe nha.`,
      `Sương mù dày đặc, hạn chế vượt xe khác nếu không thật cần thiết bạn nhé.`,
      `Trời sương sớm hơi lạnh, nhớ mặc ấm khi ra ngoài nha.`,
      `Sương mù thế này, đi xe máy nhớ bật đèn pha cho dễ nhận diện nhé!`,
      `Trời mờ sương, nhớ giữ khoảng cách với xe phía trước bạn nhé.`,
      `Sương mù có thể làm ẩm đường, đi lại chú ý kẻo trơn trượt nha.`,
      `Trời ${w.city} sương phủ nhẹ, một buổi sáng yên bình nhưng vẫn nhớ cẩn thận khi di chuyển nhé.`,
      `Sương mù rồi tan cũng nhanh thôi, tạm thời cứ đi chậm và quan sát kỹ bạn nhé!`,
    ];
  }
  return [
    `Thời tiết ${w.city} hôm nay khá dễ chịu, ${t}°C, chúc bạn một ngày suôn sẻ! 🌤️`,
    `Trời ${w.city} hôm nay mát mẻ đó, tranh thủ làm việc năng suất nha!`,
    `Thời tiết đẹp thế này, tâm trạng chắc cũng tốt theo đúng không bạn? 😊`,
    `${t}°C, trời khá ôn hòa, chúc bạn một ngày làm việc hiệu quả nhé!`,
    `Thời tiết hôm nay ổn định, không nóng không lạnh, quá lý tưởng để làm việc rồi!`,
    `Trời ${w.city} hôm nay đẹp lắm, tranh thủ hoàn thành thật tốt công việc nhé!`,
    `${t}°C, thời tiết như vậy là quá chiều lòng người rồi đó bạn ơi!`,
    `Trời ${w.city} trong xanh, ${t}°C dễ chịu, tận hưởng một ngày thật trọn vẹn nhé!`,
    `Thời tiết ôn hòa thế này, tranh thủ ra ngoài vận động chút cũng tốt đó bạn.`,
    `${t}°C, gió nhẹ mát mẻ, làm việc chắc cũng hứng khởi hơn hẳn nhé!`,
    `Trời đẹp thế này mà không tranh thủ chụp vài tấm ảnh thì phí lắm bạn ơi 📸`,
    `Thời tiết ${w.city} hôm nay quá ổn, chúc bạn một ngày tràn đầy năng lượng!`,
    `${t}°C, không khí trong lành, hít thở sâu một cái cho sảng khoái nào!`,
    `Trời quang mây tạnh thế này, tâm trạng cũng nhẹ nhõm theo đúng không bạn?`,
    `Thời tiết lý tưởng để làm việc lẫn nghỉ ngơi, tận dụng thật tốt nhé bạn!`,
    `${t}°C, mát mẻ dễ chịu, chúc bạn một ngày làm việc thật trôi chảy!`,
    `Trời ${w.city} hôm nay ưu ái ghê, tranh thủ hoàn thành hết việc còn dang dở nhé.`,
    `Thời tiết này mà đi dạo một vòng thì tuyệt vời phải biết bạn ơi!`,
    `${t}°C, trời trong lành mát mẻ, chúc một ngày mới nhiều niềm vui nhé!`,
    `Trời đẹp vậy, chắc hôm nay mọi việc của bạn cũng suôn sẻ như thời tiết thôi!`,
  ];
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Chi chon NGAU NHIEN 1 trong 2 - hoac cau theo moc gio, hoac cau theo thoi tiet - thay vi ghep
// ca 2 lam cau qua dai. Khong co du lieu thoi tiet (weather=null) thi luon dung cau theo gio.
export function buildGreeting(tod: TimeOfDay, weather: WeatherInfo | null): string {
  if (!weather) return pick(TIME_TEMPLATES[tod]);
  return Math.random() < 0.5 ? pick(TIME_TEMPLATES[tod]) : pick(weatherRemarks(weather));
}

/**
 * Loi chao sinh boi Gemini (GET /api/greeting/ai, xem routes/greeting.ts) - hoan toan tach rieng
 * khoi buildGreeting() o tren: FE hien buildGreeting() (mau co san) NGAY LAP TUC, roi goi endpoint
 * nay SAU o nen, thay vao neu thanh cong - khong bao gio chan/lam cham lan hien dau tien. Cung
 * nguyen tac "khong duoc lam vo trang" nhu fetchWeather(): moi loi (mang, timeout, key sai, model
 * tra ve rong/qua dai/khong dung dinh dang) deu nuot va tra null, KHONG throw.
 */
const GEMINI_MODEL = "gemini-3.5-flash-lite";
const GEMINI_TIMEOUT_MS = 4000;
const AI_MESSAGE_MAX_LEN = 150;

const TIME_LABEL: Record<TimeOfDay, string> = {
  sang_som: "sang som tinh mo",
  sang: "buoi sang",
  trua: "buoi trua",
  chieu: "buoi chieu",
  toi: "buoi toi",
  khuya: "dem khuya",
};

function weatherLabel(w: WeatherInfo): string {
  const t = Math.round(w.tempC);
  if (w.isRain) return `troi ${w.city} dang mua, ${t} do C`;
  if (w.isHot) return `troi ${w.city} nang nong ${t} do C`;
  if (w.isCold) return `troi ${w.city} se lanh ${t} do C`;
  if (w.isFog) return `troi ${w.city} co suong mu, ${t} do C`;
  return `troi ${w.city} de chiu, ${t} do C`;
}

function buildAiPrompt(tod: TimeOfDay, weather: WeatherInfo | null): string {
  const boiCanh = weather ? `${TIME_LABEL[tod]}, ${weatherLabel(weather)}` : TIME_LABEL[tod];
  return [
    "Viet DUNG 1 cau chao ngan gon, than thien, tu nhien bang tieng Viet co dau, danh cho nhan vien noi bo mot he thong quan ly dich vu bao hanh dang mo web luc dau ngay lam viec.",
    `Boi canh hien tai: ${boiCanh}.`,
    `Yeu cau bat buoc: khong qua ${AI_MESSAGE_MAX_LEN} ky tu, khong dung dau ngoac kep, khong dung markdown/dau *, toi da 1 emoji, giong gan gui vui ve nhu dong nghiep, KHONG nhac lai nguyen van boi canh vua neu.`,
    "Chi tra ve dung 1 cau duy nhat, khong giai thich, khong ghi chu gi them.",
  ].join(" ");
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

export async function fetchAiGreeting(apiKey: string, tod: TimeOfDay, weather: WeatherInfo | null): Promise<string | null> {
  if (!apiKey) {
    console.error("[greeting-ai] thieu GEMINI_API_KEY");
    return null;
  }
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: buildAiPrompt(tod, weather) }] }] }),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    });
    if (!res.ok) {
      // Log loi that (khong lo key that vi apiKey khong nam trong body/response) - can biet DUNG
      // nguyen nhan (401 key sai, 404 model sai, 429 het quota...) thay vi chi biet "that bai".
      console.error(`[greeting-ai] Gemini tra ve ${res.status}: ${(await res.text()).slice(0, 500)}`);
      return null;
    }

    const data = (await res.json()) as GeminiResponse;
    const text = data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim();
    if (!text) {
      console.error(`[greeting-ai] Gemini tra ve 200 nhung khong co text: ${JSON.stringify(data).slice(0, 500)}`);
      return null;
    }

    // AI khong luon tuan thu dung yeu cau prompt (ban chat khong dam bao tuyet doi cua LLM) - bo
    // dau ngoac kep neu AI tu them, roi loai bo neu qua dai/rong sau khi lam sach thay vi hien 1
    // cau bi cat cut hoac sai dinh dang.
    const cleaned = text.replace(/^["“”']+|["“”']+$/g, "").trim();
    if (cleaned.length === 0 || cleaned.length > AI_MESSAGE_MAX_LEN) {
      console.error(`[greeting-ai] cau sau khi lam sach khong hop le (do dai ${cleaned.length}): ${cleaned.slice(0, 200)}`);
      return null;
    }
    return cleaned;
  } catch (err) {
    console.error("[greeting-ai] loi khi goi Gemini:", err instanceof Error ? err.message : String(err));
    return null;
  }
}
