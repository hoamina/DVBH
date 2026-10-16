import { useState } from "react";
import { Modal } from "./ui/Modal";
import { StatCard } from "./ui/StatCard";
import { ImportUploader } from "./ImportUploader";
import type { VaiTro } from "../auth/AuthContext";

// Import giai trinh lap nhanh (backend routes/importGiaiTrinhLapNhanh.ts) - ban hang loat cua 2 nut chot tay
// "Chot lap" (Giam sat) / "QC chot" tren tung ca. Giam sat luon ghi cap GS, QC luon ghi cap QC, Admin chon.
interface Summary {
  thanhCong: number;
  ghiDe: number;
  loi: number;
  errors: string[];
  vai: "gs" | "qc";
}

const COLUMN_MAP: Record<string, string> = {
  "ID CASE": "case_id",
  "KẾT LUẬN LẶP": "ket_luan",
  "HÌNH THỨC XỬ LÝ": "hinh_thuc",
  "DIỄN GIẢI / GHI CHÚ": "ghi_chu",
};

export const VAI_TRO_IMPORT_GIAI_TRINH_LAP: VaiTro[] = ["Giam sat", "QC", "Admin"];

export function ImportGiaiTrinhLapModal({ open, onClose, role }: { open: boolean; onClose: () => void; role: VaiTro | null }) {
  const [vaiAdmin, setVaiAdmin] = useState<"gs" | "qc">("gs");
  const vai: "gs" | "qc" = role === "QC" ? "qc" : role === "Giam sat" ? "gs" : vaiAdmin;
  const capLabel = vai === "gs" ? "Chốt đánh giá lặp (Giám sát)" : "QC chốt";

  return (
    <Modal open={open} onClose={onClose} title="Import giải trình lặp nhanh" width="max-w-2xl">
      {role === "Admin" && (
        <div className="flex items-center gap-2 mb-3 text-sm">
          <span className="text-[var(--ink-600)]">Ghi theo vai:</span>
          {(["gs", "qc"] as const).map((v) => (
            <label key={v} className="inline-flex items-center gap-1 cursor-pointer">
              <input type="radio" name="vai-import-gtl" checked={vaiAdmin === v} onChange={() => setVaiAdmin(v)} />
              {v === "gs" ? "Giám sát" : "QC"}
            </label>
          ))}
        </div>
      )}
      <ImportUploader<Summary>
        // key theo vai: doi vai thi xoa ket qua xem truoc cu (da kiem theo vai truoc do).
        key={vai}
        description={
          <div className="space-y-1.5">
            <div>
              Ghi <b>{capLabel}</b> cho nhiều ca lặp cùng lúc — mỗi dòng giống như bấm nút chốt tay trên ca đó. Người giải trình và ngày ghi
              nhận là bạn, tại thời điểm import.
            </div>
            <ol className="list-decimal pl-5 space-y-0.5">
              <li>
                Bấm <b>⬇ Tải file mẫu</b>. File có 3 sheet: <b>Mẫu</b> (điền ở đây), <b>Danh sách lựa chọn</b> (các giá trị hợp lệ), <b>Hướng dẫn</b>.
              </li>
              <li>
                Cột <b className="font-mono">ID CASE</b> và <b className="font-mono">KẾT LUẬN LẶP</b> bắt buộc. <b className="font-mono">HÌNH THỨC XỬ LÝ</b> để trống
                = giữ nguyên giá trị đang có. Giá trị chọn theo sheet "Danh sách lựa chọn", không phân biệt hoa/thường, có/không dấu.
              </li>
              <li>
                <b className="font-mono">DIỄN GIẢI / GHI CHÚ</b>: {vai === "gs" ? "diễn giải lặp" : "ghi chú QC"}; để trống sẽ xóa nội dung cũ (giống nút chốt tay).
              </li>
              <li>
                Chọn file → xem trước số dòng hợp lệ, số ca sẽ bị ghi đè và lỗi từng dòng → bấm xác nhận để ghi.
                {vai === "gs" && " Giám sát chỉ ghi được ca thuộc khu vực mình phụ trách."}
              </li>
            </ol>
          </div>
        }
        templateUrl="/api/import/giai-trinh-lap-nhanh/template"
        previewUrl="/import/giai-trinh-lap-nhanh/preview"
        commitUrl="/import/giai-trinh-lap-nhanh/commit"
        columnMap={COLUMN_MAP}
        requireAllColumns
        buildBody={(rows, filename) => ({ rows, filename, vai })}
        renderSummary={(s) => (
          <div className="grid grid-cols-3 gap-3 mb-2">
            <StatCard label="Hợp lệ, sẽ ghi" value={s.thanhCong} tone="teal" />
            <StatCard label="Trong đó ghi đè kết luận cũ" value={s.ghiDe} tone={s.ghiDe > 0 ? "amber" : "gray"} />
            <StatCard label="Dòng lỗi" value={s.loi} tone={s.loi > 0 ? "coral" : "gray"} />
          </div>
        )}
        getErrors={(s) => s.errors}
        successMessage={(s) => `Đã ghi ${capLabel.toLowerCase()} cho ${s.thanhCong} ca${s.loi ? ` · ${s.loi} dòng lỗi bị bỏ qua` : ""}`}
        invalidateKeys={[["ca-lap-list"], ["ca-lap-status"], ["ca-lap-tong-quan"], ["ca-lap-detection"], ["notifications-count"]]}
      />
    </Modal>
  );
}
