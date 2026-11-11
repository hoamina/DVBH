// Dat loi loc NSKX sang linh-kien-app (2026-11-11, v1.571) - DUNG CHUNG cho dat le (tab NSKX trong chi tiet ca) va dat hang loat (menu QL NSKX).
// Backend: routes/qlNskx.ts POST /dat-loi/xem-truoc + /dat-loi/tao (lib/nskxDatLoi.ts). Nguoi dat = tai khoan dang bam; nguoi nhan = KTV trien
// khai (khong co thi Tram trien khai); chi dat loi da xac nhan, loai "HỖ TRỢ NGOÀI BẢO HÀNH TG12-NSKX".
// Hang loat: moi PHIEU (1 nguoi nhan) goi /dat-loi/tao RIENG, TUAN TU, co tien do - 1 phieu loi khong lam hong phieu khac; bam lai khong tao trung
// (server doc song don TG12 + ma_yeu_cau tat dinh).
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import { Modal } from "./ui/Modal";
import { Btn } from "./ui/Btn";
import { Badge } from "./ui/Badge";
import { tr } from "../i18n/tr";

interface Dong {
  case_id: string;
  ma_lk: string;
  ten_lk: string;
  so_luong: number;
  trang_thai: string | null;
  loi: string | null;
  thong_diep: string | null;
  don_id?: string | null;
}
interface Phieu {
  ma_ktv: string;
  ten_nguoi_nhan: string;
  ca: string[];
  dong: Dong[];
  loi_phieu: string | null;
}
interface BoQua {
  case_id: string;
  ma_lk?: string;
  ly_do: string;
}
interface KetQua {
  ma_ktv: string;
  ten_nguoi_nhan: string;
  ca: string[];
  phieu_id: string | null;
  trung_lap: boolean;
  loi: string | null;
  dong: Dong[];
}

// Trang thai khoi tao ben linh-kien-app -> nhan de hieu.
const TT: Record<string, string> = {
  "TN da duyet": "Tự duyệt — vào phiếu xuất kho",
  "Cho thanh toan": "Thiếu hàng — chờ chuyển tiền",
  "Cho hang": "Thiếu hàng — chờ hàng",
  "Cho GS duyet": "Chờ Giám sát duyệt",
  "Cho TBP xac nhan": "Chờ TBP xác nhận (LK đặc thù)",
};
const nhanTT = (s: string | null) => (s ? tr(TT[s] ?? s) : "—");
const msg = (e: unknown) => (e instanceof ApiError ? e.message : String(e));

export function DatLoiNskxModal({ caseIds, onClose }: { caseIds: string[]; onClose: () => void }) {
  const qc = useQueryClient();
  const datLe = caseIds.length === 1;
  const [dangTai, setDangTai] = useState(true);
  const [loi, setLoi] = useState<string | null>(null);
  const [phieu, setPhieu] = useState<Phieu[]>([]);
  const [boQua, setBoQua] = useState<BoQua[]>([]);
  const [chon, setChon] = useState<Set<number>>(new Set());
  const [dangDat, setDangDat] = useState(false);
  const [tienDo, setTienDo] = useState(0);
  const [ketQua, setKetQua] = useState<KetQua[] | null>(null);
  const [boQuaSau, setBoQuaSau] = useState<BoQua[]>([]);
  const [daKiemTra, setDaKiemTra] = useState(false);
  // Nhom phieu theo KTV nhan (1 KTV co the > 1 phieu khi > 30 dong) - chon / hien theo nhom.
  const nhomKtv = useMemo(() => {
    const m = new Map<string, { ten: string; idx: number[] }>();
    phieu.forEach((p, i) => {
      const g = m.get(p.ma_ktv) ?? { ten: p.ten_nguoi_nhan, idx: [] };
      g.idx.push(i);
      m.set(p.ma_ktv, g);
    });
    return [...m.entries()].map(([ma, g]) => ({ ma, ...g }));
  }, [phieu]);

  useEffect(() => {
    let huy = false;
    api
      .post<{ phieu: Phieu[]; bo_qua: BoQua[]; da_kiem_tra: boolean }>("/ql-nskx/dat-loi/xem-truoc", { case_ids: caseIds, kiem_tra: true })
      .then((r) => {
        if (huy) return;
        setPhieu(r.phieu);
        setBoQua(r.bo_qua);
        setDaKiemTra(r.da_kiem_tra);
        // Bo chon san phieu loi ca phieu / moi dong deu bi chan (van xem duoc ly do, tu tick lai neu muon).
        setChon(new Set(r.phieu.map((_, i) => i).filter((i) => !r.phieu[i].loi_phieu && !(r.phieu[i].dong.length && r.phieu[i].dong.every((d) => d.loi)))));
      })
      .catch((e) => !huy && setLoi(msg(e)))
      .finally(() => !huy && setDangTai(false));
    return () => {
      huy = true;
    };
  }, [caseIds]);

  const tong = useMemo(() => {
    const ds = phieu.filter((_, i) => chon.has(i));
    return { phieu: ds.length, ca: new Set(ds.flatMap((p) => p.ca)).size, dong: ds.reduce((s, p) => s + p.dong.length, 0) };
  }, [phieu, chon]);

  async function dat() {
    const ds = phieu.filter((_, i) => chon.has(i));
    setDangDat(true);
    setTienDo(0);
    const kq: KetQua[] = [];
    const bq: BoQua[] = [];
    // TUAN TU tung phieu (1 nguoi nhan) - khong gui song song.
    for (const [i, p] of ds.entries()) {
      try {
        const r = await api.post<{ ket_qua: KetQua[]; bo_qua: BoQua[] }>("/ql-nskx/dat-loi/tao", { case_ids: p.ca });
        kq.push(...r.ket_qua);
        bq.push(...r.bo_qua);
      } catch (e) {
        kq.push({ ma_ktv: p.ma_ktv, ten_nguoi_nhan: p.ten_nguoi_nhan, ca: p.ca, phieu_id: null, trung_lap: false, loi: msg(e), dong: p.dong });
      }
      setTienDo(i + 1);
      setKetQua([...kq]);
    }
    setBoQuaSau(bq);
    setDangDat(false);
    qc.invalidateQueries({ queryKey: ["ql-nskx"] });
    for (const id of new Set(ds.flatMap((p) => p.ca))) qc.invalidateQueries({ queryKey: ["linh-kien-timeline", id] });
  }

  const thanhCong = (ketQua ?? []).filter((k) => k.phieu_id);
  const footer = ketQua && !dangDat ? (
    <div className="flex justify-end">
      <Btn size="sm" onClick={onClose}>{tr("Đóng")}</Btn>
    </div>
  ) : (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-[var(--ink-500)]">
        {dangDat ? tr("Đang đặt {0}/{1} phiếu… (không đóng cửa sổ)", tienDo, tong.phieu) : tr("{0} KTV · {1} phiếu · {2} ca · {3} dòng lõi", new Set(phieu.filter((_, i) => chon.has(i)).map((p) => p.ma_ktv)).size, tong.phieu, tong.ca, tong.dong)}
      </span>
      <div className="flex gap-2">
        <Btn variant="ghost" size="sm" onClick={onClose} disabled={dangDat}>{tr("Huỷ")}</Btn>
        <Btn size="sm" onClick={dat} disabled={dangDat || dangTai || tong.phieu === 0} loading={dangDat}>
          {tr("Xác nhận đặt")}
        </Btn>
      </div>
    </div>
  );

  return (
    <Modal open onClose={dangDat ? () => {} : onClose} title={datLe ? tr("Đặt lõi lọc — ca {0}", caseIds[0]) : tr("Đặt lõi hàng loạt — {0} ca", caseIds.length)} width="max-w-3xl" footer={footer}>
      <div className="flex flex-col gap-3 text-sm">
        <div className="text-xs text-[var(--ink-500)] leading-relaxed">
          {tr("Đơn tạo bên linh-kien-app bằng tài khoản của bạn, loại “HỖ TRỢ NGOÀI BẢO HÀNH TG12-NSKX”, người nhận = KTV triển khai (không có thì Trạm triển khai), mã YCSC = mã ca. Chỉ đặt lõi đã xác nhận; dây / cút đặt ngoài. Lõi đã có đơn TG12 sẽ không đặt lại.")}
        </div>
        {dangTai && <div className="text-[var(--ink-400)]">{tr("Đang lập danh sách đặt…")}</div>}
        {loi && <div className="text-[var(--coral-600)]">{loi}</div>}

        {ketQua ? (
          <>
            <div className="font-semibold">
              {tr("Kết quả: {0}/{1} phiếu tạo thành công", thanhCong.length, ketQua.length)}
            </div>
            {ketQua.map((k, i) => (
              <div key={i} className="border border-[var(--line)] rounded-lg p-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <b>{k.ten_nguoi_nhan}</b>
                  {k.phieu_id ? <Badge tone="teal">{k.trung_lap ? tr("Phiếu {0} (đã tạo trước đó)", k.phieu_id) : tr("Phiếu {0}", k.phieu_id)}</Badge> : <Badge tone="coral">{tr("Không tạo được")}</Badge>}
                </div>
                {k.loi && <div className="text-xs text-[var(--coral-600)] mt-1">{k.loi}</div>}
                <BangDong dong={k.dong} />
              </div>
            ))}
            <DanhSachBoQua ds={boQuaSau} />
          </>
        ) : (
          !dangTai && !loi && (
            <>
              {phieu.length === 0 && <div className="text-[var(--ink-500)]">{tr("Không có lõi nào cần đặt.")}</div>}
              {phieu.length > 0 && (
                <div className="flex items-center gap-3 flex-wrap text-xs text-[var(--ink-500)]">
                  {!datLe && nhomKtv.length > 1 && (
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={chon.size === phieu.length}
                        onChange={(e) => setChon(e.target.checked ? new Set(phieu.map((_, i) => i)) : new Set())}
                        disabled={dangDat}
                      />
                      {tr("Chọn tất cả {0} KTV", nhomKtv.length)}
                    </label>
                  )}
                  <span>{daKiemTra ? tr("Cột “Dự kiến” = kết quả kiểm tra trước bên linh-kien-app (giá, tồn kho, tự duyệt) — chưa tạo đơn.") : tr("Danh sách lớn: kết quả từng dòng sẽ kiểm tra lúc đặt.")}</span>
                </div>
              )}
              {nhomKtv.map((g) => {
                const ds = g.idx.map((i) => phieu[i]);
                const dong = ds.flatMap((p) => p.dong);
                const soCa = new Set(ds.flatMap((p) => p.ca)).size;
                const daChon = g.idx.every((i) => chon.has(i));
                const loiPhieu = [...new Set(ds.map((p) => p.loi_phieu).filter(Boolean))];
                return (
                  <div key={g.ma} className="border border-[var(--line)] rounded-lg p-2">
                    <label className="flex items-center gap-2 flex-wrap">
                      {!datLe && (
                        <input
                          type="checkbox"
                          checked={daChon}
                          disabled={dangDat}
                          onChange={(e) => {
                            const s2 = new Set(chon);
                            for (const i of g.idx) {
                              if (e.target.checked) s2.add(i);
                              else s2.delete(i);
                            }
                            setChon(s2);
                          }}
                        />
                      )}
                      <b>{g.ten}</b>
                      <span className="text-xs text-[var(--ink-500)]">
                        {tr("{0} ca · {1} dòng · {2} phiếu", soCa, dong.length, ds.length)}
                      </span>
                    </label>
                    {loiPhieu.map((l) => (
                      <div key={l} className="text-xs text-[var(--coral-600)] mt-1">
                        {l}
                      </div>
                    ))}
                    <BangLoiGop dong={dong} coDuKien={daKiemTra} />
                    <details className="text-xs mt-1">
                      <summary className="cursor-pointer text-[var(--ocean-600)]">{tr("Chi tiết theo ca")}</summary>
                      <BangDong dong={dong} />
                    </details>
                  </div>
                );
              })}
              <DanhSachBoQua ds={boQua} />
            </>
          )
        )}
      </div>
    </Modal>
  );
}

/** Bang loi du kien dat cua 1 KTV, gop theo ma loi: so ca, tong SL, du kien (dem theo trang thai kiem tra / loi). */
function BangLoiGop({ dong, coDuKien }: { dong: Dong[]; coDuKien: boolean }) {
  const gop = new Map<string, { ten: string; ca: Set<string>; sl: number; kq: Map<string, number>; loi: boolean }>();
  for (const d of dong) {
    const g = gop.get(d.ma_lk) ?? { ten: d.ten_lk, ca: new Set<string>(), sl: 0, kq: new Map<string, number>(), loi: false };
    g.ca.add(d.case_id);
    g.sl += d.so_luong;
    const nhan = d.loi ? (d.thong_diep ?? d.loi) : nhanTT(d.trang_thai);
    if (d.loi) g.loi = true;
    g.kq.set(nhan, (g.kq.get(nhan) ?? 0) + 1);
    gop.set(d.ma_lk, g);
  }
  return (
    <table className="w-full text-xs mt-1">
      <thead>
        <tr className="text-left text-[var(--ink-500)]">
          <th className="py-0.5 pr-2">{tr("Mã lõi")}</th>
          <th className="py-0.5 pr-2">{tr("Tên")}</th>
          <th className="py-0.5 pr-2 text-right">{tr("Số ca")}</th>
          <th className="py-0.5 pr-2 text-right">{tr("Tổng SL")}</th>
          {coDuKien && <th className="py-0.5">{tr("Dự kiến")}</th>}
        </tr>
      </thead>
      <tbody>
        {[...gop.entries()].map(([ma, g]) => (
          <tr key={ma} className="border-t border-[var(--line)]">
            <td className="py-0.5 pr-2 font-mono">{ma}</td>
            <td className="py-0.5 pr-2">{g.ten}</td>
            <td className="py-0.5 pr-2 text-right">{g.ca.size}</td>
            <td className="py-0.5 pr-2 text-right font-semibold">{g.sl}</td>
            {coDuKien && (
              <td className={`py-0.5 ${g.loi ? "text-[var(--coral-600)]" : ""}`}>
                {[...g.kq.entries()].map(([k, n]) => (g.kq.size > 1 || n > 1 ? `${k} ×${n}` : k)).join(" · ")}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BangDong({ dong }: { dong: Dong[] }) {
  if (!dong.length) return null;
  const coTT = dong.some((d) => d.trang_thai || d.loi);
  return (
    <table className="w-full text-xs mt-1">
      <thead>
        <tr className="text-left text-[var(--ink-500)]">
          <th className="py-0.5 pr-2">{tr("Ca")}</th>
          <th className="py-0.5 pr-2">{tr("Lõi")}</th>
          <th className="py-0.5 pr-2 text-right">SL</th>
          {coTT && <th className="py-0.5">{tr("Kết quả")}</th>}
        </tr>
      </thead>
      <tbody>
        {dong.map((d, j) => (
          <tr key={j} className="border-t border-[var(--line)]">
            <td className="py-0.5 pr-2 font-mono">{d.case_id}</td>
            <td className="py-0.5 pr-2">
              <span className="font-mono">{d.ma_lk}</span> {d.ten_lk}
            </td>
            <td className="py-0.5 pr-2 text-right">{d.so_luong}</td>
            {coTT && (
              <td className="py-0.5">
                {d.loi ? (
                  <span className="text-[var(--coral-600)]">{d.thong_diep ?? d.loi}</span>
                ) : (
                  <span title={d.thong_diep ?? ""}>
                    {d.don_id ? <span className="font-mono">{d.don_id} · </span> : null}
                    {nhanTT(d.trang_thai)}
                  </span>
                )}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DanhSachBoQua({ ds }: { ds: BoQua[] }) {
  if (!ds.length) return null;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-[var(--ink-600)]">{tr("Không đặt {0} mục (bấm để xem lý do)", ds.length)}</summary>
      <ul className="mt-1 flex flex-col gap-0.5">
        {ds.map((b, i) => (
          <li key={i}>
            <span className="font-mono">{b.case_id}</span>
            {b.ma_lk ? <span className="font-mono"> · {b.ma_lk}</span> : null} — {b.ly_do}
          </li>
        ))}
      </ul>
    </details>
  );
}
