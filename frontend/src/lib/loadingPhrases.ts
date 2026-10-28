import { tr } from "../i18n/tr";
/**
 * Cau vui + emoji hien ngau nhien luc man hinh dang cho load du lieu - de thoi gian cho bot nham
 * chan, dung tinh than noi bo cua he thong ("Hệ thống nội bộ..." xem Sidebar.tsx). Emoji gan rieng
 * cho tung cau (khong random doc lap) de hop ngu canh, dung emoji Unicode san co - khong tai anh.
 */
export interface LoadingPhrase {
  text: string;
  emoji: string;
}

export const LOADING_PHRASES: LoadingPhrase[] = [
  { text: tr("Bạn có vội đi đâu không? Chứ tôi thì không vội lắm!"), emoji: "😌" },
  { text: tr("Cứ từ từ, khoai sẽ nhừ..."), emoji: "🍠" },
  { text: tr("Hệ thống chậm chắc chắn là do ông Thái đấy, không phải do tôi... T_T"), emoji: "😭" },
  { text: tr("Mọi người ý kiến với sếp Hoa là web ngon nhức nách nhé!"), emoji: "😎" },
  { text: tr("Người ta có câu đợi chờ là hạnh phúc, em cho anh chị hạnh phúc nè!"), emoji: "🥰" },
  { text: tr("Đang gọi dữ liệu dậy, nó ngủ nướng hơi lâu..."), emoji: "😴" },
  { text: tr("Uống ngụm trà đã, sắp xong rồi!"), emoji: "🍵" },
  { text: tr("Data đang đi bộ từ kho lên, chờ nó thở cái đã."), emoji: "🚶" },
  { text: tr("1 giây thôi mà nhân viên IT dựng cả tòa lâu đài đấy!"), emoji: "🏰" },
  { text: tr("Chậm một chút để chắc một chút, cho anh/chị nhé."), emoji: "🐢" },
  { text: tr("Đang xếp hàng, mời quý khách kiên nhẫn tí xíu."), emoji: "🚦" },
  { text: tr("Load nhanh quá sợ anh/chị ngất vì bất ngờ, nên load từ từ thôi."), emoji: "😵" },
  { text: tr("Server đang tập gym, sắp có sức chạy nhanh hơn rồi!"), emoji: "💪" },
  { text: tr("Ai bảo mì ăn liền nhanh, dữ liệu này còn phải tẩm ướp kỹ hơn."), emoji: "🍜" },
  { text: tr("Nhân viên pha cà phê cho hệ thống hơi chậm tay, thông cảm nha."), emoji: "☕" },
  { text: tr("Sắp xong rồi, đừng refresh kẻo phải xếp hàng lại từ đầu đó!"), emoji: "🔄" },
  { text: tr("Hôm nay mạng hơi... có tâm trạng, mong anh/chị thấu hiểu."), emoji: "📶" },
  { text: tr("Đang nhặt từng dòng dữ liệu về cho anh/chị, đẹp mắt mới thôi."), emoji: "🧹" },
  { text: tr("1... 2... 3... sắp ra rồi, đừng nháy mắt bỏ lỡ nha!"), emoji: "🎬" },
  { text: tr("Bộ phận hậu cần đang bốc dữ liệu lên xe, chờ chút xíu."), emoji: "🚚" },
  { text: tr("Ai nói chờ đợi là cực hình, chờ đợi là để nâng cao... sức chịu đựng!"), emoji: "🧘" },
  { text: tr("Đợi xíu, để em chỉnh lại tóc cho hệ thống đẹp trai load ra."), emoji: "💇" },
  { text: tr("Không phải bug đâu, là hệ thống đang trầm tư suy nghĩ đó."), emoji: "🤔" },
  { text: tr("Cà phê chưa pha xong thì dữ liệu cũng chưa xong, công bằng ha."), emoji: "☕" },
  { text: tr("Sắp có rồi, đừng đóng tab kẻo tội nghiệp con số liệu đang chạy."), emoji: "🏃" },
  { text: tr("Wifi công ty đang cố gắng hết sức, mong mọi người vỗ tay động viên."), emoji: "📡" },
  { text: tr("Không phải chờ lâu, là chờ... hơi lâu thôi, khác nhau đó nha!"), emoji: "😅" },
  { text: tr("Đang tính KPI cho từng dòng dữ liệu trước khi giao cho anh/chị."), emoji: "📊" },
  { text: tr("Hộp đen đang xử lý, đừng gõ cửa hỏi nó có đang nghỉ trưa không."), emoji: "📦" },
  { text: tr("Mỗi giây chờ là một giây hệ thống thầm cảm ơn vì đã kiên nhẫn."), emoji: "🙏" },
  { text: tr("Sắp xong, kịp giờ tan ca nên đang chạy nước rút nè!"), emoji: "🏁" },
  { text: tr("Dữ liệu đang trang điểm trước khi ra gặp anh/chị, chờ chút hen."), emoji: "💄" },
  { text: tr("Ai giục nhanh quá hệ thống mắc cỡ chạy chậm lại đó nha!"), emoji: "😳" },
  { text: tr("Đợi xíu, để hệ thống điểm danh xong hết dữ liệu đã."), emoji: "✅" },
  { text: tr("Sếp Hoa duyệt xong dữ liệu là hiện liền à, đang trình ký nè!"), emoji: "📝" },
];

export function randomLoadingPhrase(): LoadingPhrase {
  return LOADING_PHRASES[Math.floor(Math.random() * LOADING_PHRASES.length)];
}
