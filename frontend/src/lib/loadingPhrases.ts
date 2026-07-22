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
  { text: "Bạn có vội đi đâu không? Chứ tôi thì không vội lắm!", emoji: "😌" },
  { text: "Cứ từ từ, khoai sẽ nhừ...", emoji: "🍠" },
  { text: "Hệ thống chậm chắc chắn là do ông Thái đấy, không phải do tôi... T_T", emoji: "😭" },
  { text: "Mọi người ý kiến với sếp Hoa là web ngon nhức nách nhé!", emoji: "😎" },
  { text: "Người ta có câu đợi chờ là hạnh phúc, em cho anh chị hạnh phúc nè!", emoji: "🥰" },
  { text: "Đang gọi dữ liệu dậy, nó ngủ nướng hơi lâu...", emoji: "😴" },
  { text: "Uống ngụm trà đã, sắp xong rồi!", emoji: "🍵" },
  { text: "Data đang đi bộ từ kho lên, chờ nó thở cái đã.", emoji: "🚶" },
  { text: "1 giây thôi mà nhân viên IT dựng cả tòa lâu đài đấy!", emoji: "🏰" },
  { text: "Chậm một chút để chắc một chút, cho anh/chị nhé.", emoji: "🐢" },
  { text: "Đang xếp hàng, mời quý khách kiên nhẫn tí xíu.", emoji: "🚦" },
  { text: "Load nhanh quá sợ anh/chị ngất vì bất ngờ, nên load từ từ thôi.", emoji: "😵" },
  { text: "Server đang tập gym, sắp có sức chạy nhanh hơn rồi!", emoji: "💪" },
  { text: "Ai bảo mì ăn liền nhanh, dữ liệu này còn phải tẩm ướp kỹ hơn.", emoji: "🍜" },
  { text: "Nhân viên pha cà phê cho hệ thống hơi chậm tay, thông cảm nha.", emoji: "☕" },
  { text: "Sắp xong rồi, đừng refresh kẻo phải xếp hàng lại từ đầu đó!", emoji: "🔄" },
  { text: "Hôm nay mạng hơi... có tâm trạng, mong anh/chị thấu hiểu.", emoji: "📶" },
  { text: "Đang nhặt từng dòng dữ liệu về cho anh/chị, đẹp mắt mới thôi.", emoji: "🧹" },
  { text: "1... 2... 3... sắp ra rồi, đừng nháy mắt bỏ lỡ nha!", emoji: "🎬" },
  { text: "Bộ phận hậu cần đang bốc dữ liệu lên xe, chờ chút xíu.", emoji: "🚚" },
  { text: "Ai nói chờ đợi là cực hình, chờ đợi là để nâng cao... sức chịu đựng!", emoji: "🧘" },
  { text: "Đợi xíu, để em chỉnh lại tóc cho hệ thống đẹp trai load ra.", emoji: "💇" },
  { text: "Không phải bug đâu, là hệ thống đang trầm tư suy nghĩ đó.", emoji: "🤔" },
  { text: "Cà phê chưa pha xong thì dữ liệu cũng chưa xong, công bằng ha.", emoji: "☕" },
  { text: "Sắp có rồi, đừng đóng tab kẻo tội nghiệp con số liệu đang chạy.", emoji: "🏃" },
  { text: "Wifi công ty đang cố gắng hết sức, mong mọi người vỗ tay động viên.", emoji: "📡" },
  { text: "Không phải chờ lâu, là chờ... hơi lâu thôi, khác nhau đó nha!", emoji: "😅" },
  { text: "Đang tính KPI cho từng dòng dữ liệu trước khi giao cho anh/chị.", emoji: "📊" },
  { text: "Hộp đen đang xử lý, đừng gõ cửa hỏi nó có đang nghỉ trưa không.", emoji: "📦" },
  { text: "Mỗi giây chờ là một giây hệ thống thầm cảm ơn vì đã kiên nhẫn.", emoji: "🙏" },
  { text: "Sắp xong, kịp giờ tan ca nên đang chạy nước rút nè!", emoji: "🏁" },
  { text: "Dữ liệu đang trang điểm trước khi ra gặp anh/chị, chờ chút hen.", emoji: "💄" },
  { text: "Ai giục nhanh quá hệ thống mắc cỡ chạy chậm lại đó nha!", emoji: "😳" },
  { text: "Đợi xíu, để hệ thống điểm danh xong hết dữ liệu đã.", emoji: "✅" },
  { text: "Sếp Hoa duyệt xong dữ liệu là hiện liền à, đang trình ký nè!", emoji: "📝" },
];

export function randomLoadingPhrase(): LoadingPhrase {
  return LOADING_PHRASES[Math.floor(Math.random() * LOADING_PHRASES.length)];
}
