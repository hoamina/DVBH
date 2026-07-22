/**
 * Cau vui hien ngau nhien luc man hinh dang cho load du lieu - de thoi gian cho bot nham chan,
 * dung tinh than noi bo cua he thong ("Hệ thống nội bộ..." xem Sidebar.tsx). Chi la 1 dong text
 * phu, khong thay the label mo ta dang tai gi (xem components/ui/LoadingCard.tsx).
 */
export const LOADING_PHRASES: string[] = [
  "Bạn có vội đi đâu không? Chứ tôi thì không vội lắm!",
  "Cứ từ từ, khoai sẽ nhừ...",
  "Hệ thống chậm chắc chắn là do ông Thái đấy, không phải do tôi... T_T",
  "Mọi người ý kiến với sếp Hoa là web ngon nhức nách nhé!",
  "Người ta có câu đợi chờ là hạnh phúc, em cho anh chị hạnh phúc nè!",
  "Đang gọi dữ liệu dậy, nó ngủ nướng hơi lâu...",
  "Uống ngụm trà đã, sắp xong rồi!",
  "Data đang đi bộ từ kho lên, chờ nó thở cái đã.",
  "1 giây thôi mà nhân viên IT dựng cả tòa lâu đài đấy!",
  "Chậm một chút để chắc một chút, cho anh/chị nhé.",
  "Đang xếp hàng, mời quý khách kiên nhẫn tí xíu.",
  "Load nhanh quá sợ anh/chị ngất vì bất ngờ, nên load từ từ thôi.",
  "Server đang tập gym, sắp có sức chạy nhanh hơn rồi!",
  "Ai bảo mì ăn liền nhanh, dữ liệu này còn phải tẩm ướp kỹ hơn.",
  "Nhân viên pha cà phê cho hệ thống hơi chậm tay, thông cảm nha.",
  "Sắp xong rồi, đừng refresh kẻo phải xếp hàng lại từ đầu đó!",
  "Hôm nay mạng hơi... có tâm trạng, mong anh/chị thấu hiểu.",
  "Đang nhặt từng dòng dữ liệu về cho anh/chị, đẹp mắt mới thôi.",
  "1... 2... 3... sắp ra rồi, đừng nháy mắt bỏ lỡ nha!",
  "Bộ phận hậu cần đang bốc dữ liệu lên xe, chờ chút xíu.",
  "Ai nói chờ đợi là cực hình, chờ đợi là để nâng cao... sức chịu đựng!",
  "Đợi xíu, để em chỉnh lại tóc cho hệ thống đẹp trai load ra.",
  "Không phải bug đâu, là hệ thống đang trầm tư suy nghĩ đó.",
  "Cà phê chưa pha xong thì dữ liệu cũng chưa xong, công bằng ha.",
  "Sắp có rồi, đừng đóng tab kẻo tội nghiệp con số liệu đang chạy.",
  "Wifi công ty đang cố gắng hết sức, mong mọi người vỗ tay động viên.",
  "Không phải chờ lâu, là chờ... hơi lâu thôi, khác nhau đó nha!",
  "Đang tính KPI cho từng dòng dữ liệu trước khi giao cho anh/chị.",
  "Hộp đen đang xử lý, đừng gõ cửa hỏi nó có đang nghỉ trưa không.",
  "Mỗi giây chờ là một giây hệ thống thầm cảm ơn vì đã kiên nhẫn.",
  "Sắp xong, kịp giờ tan ca nên đang chạy nước rút nè!",
  "Dữ liệu đang trang điểm trước khi ra gặp anh/chị, chờ chút hen.",
  "Ai giục nhanh quá hệ thống mắc cỡ chạy chậm lại đó nha!",
  "Đợi xíu, để hệ thống điểm danh xong hết dữ liệu đã.",
  "Sếp Hoa duyệt xong dữ liệu là hiện liền à, đang trình ký nè!",
];

export function randomLoadingPhrase(): string {
  return LOADING_PHRASES[Math.floor(Math.random() * LOADING_PHRASES.length)];
}
