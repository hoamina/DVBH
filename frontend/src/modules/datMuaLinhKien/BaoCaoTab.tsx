import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { fmtVND } from "../../types";
import { StatCard } from "../../components/ui/StatCard";
import type { BaoCaoRow, JumpTarget } from "./types";

// Tab "Bao cao" (nang cap 2026-08-15 thanh tab rieng + bang theo KTV cho GS/TN/Kho/Ke toan, click 1
// con so nhay sang danh sach chi tiet kem san filter). rows.length<=1 (KTV/Ve tinh tu xem minh) ->
// luoi StatCard 3 nhom; rows.length>1 (GS/TN/Kho/Ke toan) -> bang co tim kiem, sap xep theo ton dong,
// moi o so la nut bam nhay sang tab+filter+nguoiNhanHang tuong ung.
export function BaoCaoTab({ onJump, isManagerView }: { onJump: (t: JumpTarget) => void; isManagerView: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dat-mua-lk-bao-cao-tong-the"],
    queryFn: () => api.get<{ rows: BaoCaoRow[] }>("/dat-mua-lk/bao-cao-tong-the"),
  });
  const [search, setSearch] = useState("");

  const rows = data?.rows ?? [];
  if (isLoading) return <div className="text-sm text-[var(--ink-500)] py-6 text-center mt-4">Đang tải...</div>;
  if (rows.length === 0) return <div className="text-sm text-[var(--ink-400)] py-6 text-center mt-4">Chưa có dữ liệu.</div>;

  if (!isManagerView) {
    const r = rows[0];
    return (
      <div className="mt-4 space-y-4">
        <div>
          <div className="text-xs font-semibold text-[var(--ink-500)] uppercase tracking-wide mb-1.5">Đơn hàng</div>
          <div className="flex gap-2 sm:gap-3 flex-wrap">
            <StatCard label="SL đơn" value={r.slDon} tone="ocean" onClick={() => onJump({ tab: "don-cua-toi", filter: "", nguoiNhanHang: r.email })} />
            <StatCard label="SL đề xuất/đã đặt" value={r.slDeXuat} tone="ocean" onClick={() => onJump({ tab: "don-cua-toi", filter: "", nguoiNhanHang: r.email })} />
            <StatCard label="SL bị từ chối" value={r.slTuChoi} tone="coral" muted={r.slTuChoi === 0} onClick={() => onJump({ tab: "don-cua-toi", filter: "TN tu choi", nguoiNhanHang: r.email })} />
            <StatCard label="SL được duyệt" value={r.slDuyet} tone="teal" onClick={() => onJump({ tab: "don-cua-toi", filter: "TN da duyet", nguoiNhanHang: r.email })} />
            <StatCard label="SL thực duyệt" value={r.slThucDuyet} tone="teal" onClick={() => onJump({ tab: "don-cua-toi", filter: "TN da duyet", nguoiNhanHang: r.email })} />
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-[var(--ink-500)] uppercase tracking-wide mb-1.5">Tiền</div>
          <div className="flex gap-2 sm:gap-3 flex-wrap">
            <StatCard label="Tổng tiền thực tế" value={fmtVND(r.tongTienThucTe)} tone="teal" onClick={() => onJump({ tab: "don-cua-toi", filter: "TN da duyet", nguoiNhanHang: r.email })} />
            <StatCard label="Tổng chờ chuyển" value={fmtVND(r.tongChoChuyen)} tone="amber" muted={r.tongChoChuyen === 0} onClick={() => onJump({ tab: "phieu-xuat-kho", filter: "", nguoiNhanHang: r.email })} />
            <StatCard label="Tổng tiền đặt mua" value={fmtVND(r.tongTienDatMua)} tone="ocean" onClick={() => onJump({ tab: "don-cua-toi", filter: "", nguoiNhanHang: r.email })} />
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-[var(--ink-500)] uppercase tracking-wide mb-1.5">Xuất kho</div>
          <div className="flex gap-2 sm:gap-3 flex-wrap">
            <StatCard label="SL đang chờ kế toán" value={r.slChoKeToan} tone="amber" muted={r.slChoKeToan === 0} onClick={() => onJump({ tab: "phieu-xuat-kho", filter: "Cho ke toan", nguoiNhanHang: r.email })} />
            <StatCard label="SL đang chờ kho gửi" value={r.slChoKhoGui} tone="amber" muted={r.slChoKhoGui === 0} onClick={() => onJump({ tab: "phieu-xuat-kho", filter: "Da chot xong don xuat", nguoiNhanHang: r.email })} />
            <StatCard label="SL đã gửi" value={r.slDaGui} tone="ocean" onClick={() => onJump({ tab: "phieu-xuat-kho", filter: "Dang gui KTV", nguoiNhanHang: r.email })} />
            <StatCard label="SL đã xác nhận" value={r.slDaXacNhan} tone="teal" onClick={() => onJump({ tab: "phieu-xuat-kho", filter: "KTV da nhan", nguoiNhanHang: r.email })} />
          </div>
        </div>
      </div>
    );
  }

  // Ton dong = don chua xong (tru duyet/tu choi) + dong dang di qua PXK chua toi tay KTV. Sap xep
  // giam dan de day nguoi con nhieu viec len dau (chot voi chu he thong).
  function tonDong(r: BaoCaoRow) {
    return Math.max(0, r.slDon - r.slDuyet - r.slTuChoi) + r.slChoKeToan + r.slChoKhoGui + r.slDaGui;
  }
  const q = search.trim().toLowerCase();
  const filtered = rows.filter((r) => !q || (r.ten ?? "").toLowerCase().includes(q) || r.email.toLowerCase().includes(q));
  const sorted = [...filtered].sort((a, b) => tonDong(b) - tonDong(a) || (a.ten ?? a.email).localeCompare(b.ten ?? b.email));

  const tong = rows.reduce(
    (acc, r) => ({
      slDon: acc.slDon + r.slDon,
      slDeXuat: acc.slDeXuat + r.slDeXuat,
      slTuChoi: acc.slTuChoi + r.slTuChoi,
      slDuyet: acc.slDuyet + r.slDuyet,
      slThucDuyet: acc.slThucDuyet + r.slThucDuyet,
      tongTienThucTe: acc.tongTienThucTe + r.tongTienThucTe,
      tongTienDatMua: acc.tongTienDatMua + r.tongTienDatMua,
      tongChoChuyen: acc.tongChoChuyen + r.tongChoChuyen,
      slChoKeToan: acc.slChoKeToan + r.slChoKeToan,
      slChoKhoGui: acc.slChoKhoGui + r.slChoKhoGui,
      slDaGui: acc.slDaGui + r.slDaGui,
      slDaXacNhan: acc.slDaXacNhan + r.slDaXacNhan,
    }),
    { slDon: 0, slDeXuat: 0, slTuChoi: 0, slDuyet: 0, slThucDuyet: 0, tongTienThucTe: 0, tongTienDatMua: 0, tongChoChuyen: 0, slChoKeToan: 0, slChoKhoGui: 0, slDaGui: 0, slDaXacNhan: 0 },
  );

  // CHOT (ra soat module "Dat Mua Linh Kien 2.0" #22): tham "alert" - to coral CHI khi gia tri > 0
  // (dung tinh than prop `muted` da co o StatCard cho view the ca nhan) - ap dung PER-CELL, khong to
  // ca cot, tranh nhuom coral toan cot du phan lon KTV khong co van de gi.
  function Num({ value, onClick, alert }: { value: number | string; onClick: () => void; alert?: boolean }) {
    return (
      <button
        onClick={onClick}
        className={`focus-ring font-semibold hover:underline tabular-nums ${alert ? "text-[var(--coral-600)] font-extrabold" : "text-[var(--ocean-600)]"}`}
      >
        {value}
      </button>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Tìm theo tên/email KTV..."
        className="focus-ring w-full sm:w-72 bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
      />
      <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
        <table className="min-w-full text-xs border-collapse">
          <thead>
            <tr className="bg-[var(--surface-100)] text-[var(--ink-600)]">
              {/* CHOT #22: mui ten + chu thich tieu chi sap xep ngay tren header "KTV" - minh bach
                  hoa TIEU CHI sap xep bang nhan, khong bien tonDong() thanh 1 cot so lieu nghiep vu
                  moi (no von chi la tieu chi noi bo cua giao dien). Sticky de khong mat dau "dong cua
                  ai" khi cuon ngang sang nhom cot Xuat kho o cuoi bang. */}
              <th className="sticky left-0 z-10 bg-[var(--surface-100)] px-3 py-2 text-left" rowSpan={2} title="Sắp xếp theo mức tồn đọng (đơn chưa xong + đang qua PXK), giảm dần">
                KTV <span className="text-[var(--ink-400)] font-normal">▼ tồn đọng</span>
              </th>
              <th className="px-3 py-1 text-center border-l border-[var(--line)]" colSpan={5}>Đơn hàng</th>
              <th className="px-3 py-1 text-center border-l border-[var(--line)]" colSpan={3}>Tiền</th>
              <th className="px-3 py-1 text-center border-l border-[var(--line)]" colSpan={4}>Xuất kho</th>
            </tr>
            <tr className="bg-[var(--surface-100)] text-[var(--ink-600)]">
              <th className="px-2 py-1.5 text-right border-l border-[var(--line)]">SL đơn</th>
              <th className="px-2 py-1.5 text-right">SL đề xuất</th>
              <th className="px-2 py-1.5 text-right">Từ chối</th>
              <th className="px-2 py-1.5 text-right" title="Số dòng TN đã bấm Duyệt (kể cả dòng sau đó còn đổi giá/số lượng lúc chốt PXK)">Duyệt</th>
              <th className="px-2 py-1.5 text-right" title="Số dòng đã Duyệt VÀ đã ra tới Phiếu xuất kho thực tế (con số sát với hàng thật sẽ giao)">Thực duyệt</th>
              <th className="px-2 py-1.5 text-right border-l border-[var(--line)]">Tiền thực tế</th>
              <th className="px-2 py-1.5 text-right" title="Tổng tiền của các Phiếu xuất kho có yêu cầu chuyển khoản nhưng KTV/TN chưa xác nhận xong">Chờ chuyển</th>
              <th className="px-2 py-1.5 text-right">Tiền đặt mua</th>
              <th className="px-2 py-1.5 text-right border-l border-[var(--line)]" title="Phiếu xuất kho đang chờ Kế toán chốt đơn xuất">Chờ kế toán</th>
              <th className="px-2 py-1.5 text-right" title="Phiếu xuất kho đã chốt xong, đang chờ Kho gửi hàng">Chờ kho gửi</th>
              <th className="px-2 py-1.5 text-right" title="Phiếu xuất kho đã gửi, đang chờ KTV xác nhận đã nhận">Đã gửi</th>
              <th className="px-2 py-1.5 text-right">Đã xác nhận</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.email} className="border-t border-[var(--line)] hover:bg-[var(--surface-100)]/60">
                <td className="sticky left-0 z-10 bg-[var(--surface)] px-3 py-1.5 font-medium whitespace-nowrap">{r.ten || r.email}</td>
                <td className="px-2 py-1.5 text-right border-l border-[var(--line)]"><Num value={r.slDon} onClick={() => onJump({ tab: "don-cua-toi", filter: "", nguoiNhanHang: r.email })} /></td>
                <td className="px-2 py-1.5 text-right"><Num value={r.slDeXuat} onClick={() => onJump({ tab: "don-cua-toi", filter: "", nguoiNhanHang: r.email })} /></td>
                <td className="px-2 py-1.5 text-right"><Num value={r.slTuChoi} alert={r.slTuChoi > 0} onClick={() => onJump({ tab: "don-cua-toi", filter: "TN tu choi", nguoiNhanHang: r.email })} /></td>
                <td className="px-2 py-1.5 text-right"><Num value={r.slDuyet} onClick={() => onJump({ tab: "don-cua-toi", filter: "TN da duyet", nguoiNhanHang: r.email })} /></td>
                <td className="px-2 py-1.5 text-right"><Num value={r.slThucDuyet} onClick={() => onJump({ tab: "don-cua-toi", filter: "TN da duyet", nguoiNhanHang: r.email })} /></td>
                <td className="px-2 py-1.5 text-right border-l border-[var(--line)]"><Num value={fmtVND(r.tongTienThucTe)} onClick={() => onJump({ tab: "don-cua-toi", filter: "TN da duyet", nguoiNhanHang: r.email })} /></td>
                <td className="px-2 py-1.5 text-right"><Num value={fmtVND(r.tongChoChuyen)} onClick={() => onJump({ tab: "phieu-xuat-kho", filter: "", nguoiNhanHang: r.email })} /></td>
                <td className="px-2 py-1.5 text-right"><Num value={fmtVND(r.tongTienDatMua)} onClick={() => onJump({ tab: "don-cua-toi", filter: "", nguoiNhanHang: r.email })} /></td>
                <td className="px-2 py-1.5 text-right border-l border-[var(--line)]"><Num value={r.slChoKeToan} onClick={() => onJump({ tab: "phieu-xuat-kho", filter: "Cho ke toan", nguoiNhanHang: r.email })} /></td>
                <td className="px-2 py-1.5 text-right"><Num value={r.slChoKhoGui} onClick={() => onJump({ tab: "phieu-xuat-kho", filter: "Da chot xong don xuat", nguoiNhanHang: r.email })} /></td>
                <td className="px-2 py-1.5 text-right"><Num value={r.slDaGui} onClick={() => onJump({ tab: "phieu-xuat-kho", filter: "Dang gui KTV", nguoiNhanHang: r.email })} /></td>
                <td className="px-2 py-1.5 text-right"><Num value={r.slDaXacNhan} onClick={() => onJump({ tab: "phieu-xuat-kho", filter: "KTV da nhan", nguoiNhanHang: r.email })} /></td>
              </tr>
            ))}
            {/* CHOT #22: hang Tong cong tach biet bang MAU NEN dam hon + ky hieu Σ thay vi tang co
                chu - tang co chu se lech canh cot voi tabular-nums cua cac hang phia tren. */}
            <tr className="border-t-2 border-[var(--line)] bg-[var(--ocean-100)] font-semibold">
              <td className="sticky left-0 z-10 bg-[var(--ocean-100)] px-3 py-1.5">Σ Tổng cộng</td>
              <td className="px-2 py-1.5 text-right border-l border-[var(--line)]"><Num value={tong.slDon} onClick={() => onJump({ tab: "don-cua-toi", filter: "" })} /></td>
              <td className="px-2 py-1.5 text-right"><Num value={tong.slDeXuat} onClick={() => onJump({ tab: "don-cua-toi", filter: "" })} /></td>
              <td className="px-2 py-1.5 text-right"><Num value={tong.slTuChoi} alert={tong.slTuChoi > 0} onClick={() => onJump({ tab: "don-cua-toi", filter: "TN tu choi" })} /></td>
              <td className="px-2 py-1.5 text-right"><Num value={tong.slDuyet} onClick={() => onJump({ tab: "don-cua-toi", filter: "TN da duyet" })} /></td>
              <td className="px-2 py-1.5 text-right"><Num value={tong.slThucDuyet} onClick={() => onJump({ tab: "don-cua-toi", filter: "TN da duyet" })} /></td>
              <td className="px-2 py-1.5 text-right border-l border-[var(--line)]"><Num value={fmtVND(tong.tongTienThucTe)} onClick={() => onJump({ tab: "don-cua-toi", filter: "TN da duyet" })} /></td>
              <td className="px-2 py-1.5 text-right"><Num value={fmtVND(tong.tongChoChuyen)} onClick={() => onJump({ tab: "phieu-xuat-kho", filter: "" })} /></td>
              <td className="px-2 py-1.5 text-right"><Num value={fmtVND(tong.tongTienDatMua)} onClick={() => onJump({ tab: "don-cua-toi", filter: "" })} /></td>
              <td className="px-2 py-1.5 text-right border-l border-[var(--line)]"><Num value={tong.slChoKeToan} onClick={() => onJump({ tab: "phieu-xuat-kho", filter: "Cho ke toan" })} /></td>
              <td className="px-2 py-1.5 text-right"><Num value={tong.slChoKhoGui} onClick={() => onJump({ tab: "phieu-xuat-kho", filter: "Da chot xong don xuat" })} /></td>
              <td className="px-2 py-1.5 text-right"><Num value={tong.slDaGui} onClick={() => onJump({ tab: "phieu-xuat-kho", filter: "Dang gui KTV" })} /></td>
              <td className="px-2 py-1.5 text-right"><Num value={tong.slDaXacNhan} onClick={() => onJump({ tab: "phieu-xuat-kho", filter: "KTV da nhan" })} /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

