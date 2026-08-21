import { useQuery } from "@tanstack/react-query";
import { api, buildQuery } from "../api/client";
import type { CanKhaoSatRow } from "../modules/SurveyModule";

/**
 * "Can khao sat" / "Qua han khao sat" - CHOT 2026-08-02: doc truc tiep tu D1 (GET
 * /survey/candidates?tab=&thang=...), gioi han DUNG 1 thang theo thoi_gian_cskh_tiep_nhan (thoi
 * diem mo ca) - thay the co che snapshot R2 1 file khong gioi han thang truoc day (xem
 * backend/src/routes/survey.ts). Loc khu_vuc/tinh/quan_huyen/ky_thuat_vien chuyen sang server-side
 * (query param), khong con loc client-side.
 *
 * Dung 2 useQuery song song (can-khao-sat + qua-han-khao-sat) - TanStack Query tu chia se cache
 * theo queryKey nen SurveyModule.tsx va SurveyCallWorkspace.tsx cung mo 1 thang se dung chung 1
 * lan fetch thay vi goi doc lap nhau nhu co che cu.
 */
export interface SurveyCandidatesFilters {
  thang: string;
  khuVuc?: string;
  tinh?: string;
  quanHuyen?: string;
  ktv?: string;
  // Mac dinh true (dung cho SurveyCallWorkspace.tsx - luon can du lieu de chon ca goi). SurveyModule.tsx
  // truyen rieng theo view/tab dang mo, tranh fetch ca 2 tab "Can khao sat"/"Qua han khao sat" khi
  // dang xem "Bao cao" hoac cac tab khac cua "Danh sach chi tiet" - xem goi useSurveyCandidates() o do.
  enabled?: boolean;
}

function useCandidatesTab(tab: "can-khao-sat" | "qua-han-khao-sat", filters: SurveyCandidatesFilters) {
  const { thang, khuVuc, tinh, quanHuyen, ktv, enabled = true } = filters;
  return useQuery({
    queryKey: ["survey-candidates", tab, thang, khuVuc, tinh, quanHuyen, ktv],
    queryFn: () =>
      api.get<{ rows: CanKhaoSatRow[] }>(
        `/survey/candidates${buildQuery({ tab, thang, khu_vuc: khuVuc, tinh, quan_huyen: quanHuyen, ky_thuat_vien: ktv })}`,
      ),
    enabled,
  });
}

export function useSurveyCandidates(filters: SurveyCandidatesFilters) {
  const canKhaoSatQuery = useCandidatesTab("can-khao-sat", filters);
  const quaHanQuery = useCandidatesTab("qua-han-khao-sat", filters);

  function refetch() {
    canKhaoSatQuery.refetch();
    quaHanQuery.refetch();
  }

  return {
    canKhaoSat: canKhaoSatQuery.data?.rows ?? [],
    quaHanKhaoSat: quaHanQuery.data?.rows ?? [],
    isLoading: canKhaoSatQuery.isLoading || quaHanQuery.isLoading,
    isError: canKhaoSatQuery.isError || quaHanQuery.isError,
    refetch,
  };
}
