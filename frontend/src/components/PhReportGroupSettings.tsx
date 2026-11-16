import { tr } from "../i18n/tr";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { usePhReportGroups } from "../lib/phReportGroups";
import { MultiSelectFilter } from "./MultiSelectFilter";
import { Btn } from "./ui/Btn";
import { Card } from "./ui/Card";

export function PhReportGroupSettings() {
  const [groups, setGroups] = usePhReportGroups();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const { data, isPending, isError } = useQuery({ queryKey: ["dashboard-filters"], queryFn: () => api.get<{ kyThuatVien: string[] }>("/dashboard/filters") });
  const stations = [...new Set([...(data?.kyThuatVien ?? []), ...groups.flatMap((g) => g.stations)])].sort();
  return <Card className="p-4 mt-4">
    <div className="font-bold mb-2">{tr("Nhóm trạm PH")}</div>
    <p className="text-sm mb-3">{tr("Chỉ lưu trên trình duyệt này. KRF tự nhận tất cả trạm chưa thuộc nhóm nào. Mỗi trạm chỉ thuộc một nhóm; chuyển trạm sang nhóm mới sẽ gỡ khỏi nhóm cũ.")}</p>
    {isPending && <p>{tr("Đang tải danh sách trạm…")}</p>}{isError && <p role="alert">{tr("Không tải được danh sách trạm.")}</p>}
    {groups.map((g, i) => <div key={g.name} className="flex items-center gap-3 mb-3 flex-wrap">
      <b>{g.name}</b>
      <MultiSelectFilter label={tr("Trạm")} value={g.stations.join("|")} options={stations} onChange={(v) => {
        const chosen = v.split("|").filter(Boolean);
        setGroups(groups.map((other, j) => ({ ...other, stations: j === i ? chosen : other.stations.filter((s) => !chosen.includes(s)) })));
      }} />
      <Btn variant="ghost" size="sm" onClick={() => setGroups(groups.filter((_, j) => i !== j))}>{tr("Xóa nhóm")}</Btn>
    </div>)}
    <div className="flex gap-2 items-center">
      <input aria-label={tr("Tên nhóm PH mới")} className="border rounded-lg p-2" value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("Tên nhóm mới")} maxLength={60} />
      <Btn size="sm" onClick={() => {
        const n = name.trim();
        if (!n || n.toLocaleLowerCase() === "krf" || groups.some((g) => g.name.toLocaleLowerCase() === n.toLocaleLowerCase())) { setError("Tên nhóm không được trống, trùng nhau hoặc là KRF."); return; }
        setGroups([...groups, { name: n, stations: [] }]); setName(""); setError("");
      }}>{tr("Thêm nhóm")}</Btn>
    </div>
    {error && <p role="alert" className="text-red-600 mt-2">{tr(error)}</p>}
  </Card>;
}
