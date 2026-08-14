/**
 * Dung anh PNG cho bao cao Telegram 17h30 (CHOT 2026-08-06, xem chotGiaiTrinhDailyLog trong
 * dailySnapshot.ts) - truoc gui text lit ke TOAN BO khu_vuc trong he thong bi seu phan nan "qua xau,
 * qua nhieu thong tin". Rut gon con dung 7 nhom QLDVBH + KDDV, moi nhom 1 so "con ton chua giai
 * trinh" (= can - da), to nen xanh khi = 0 / cam khi > 0.
 *
 * satori (HTML/CSS -> SVG, thuan JS) + @cf-wasm/resvg (SVG -> PNG, wasm dong goi san cho workerd) -
 * khong dung Cloudflare Browser Rendering (can binding/paid product rieng, nang hon nhieu cho 1 anh
 * nho). satori ban standalone (KHONG phai "satori" mac dinh) bat buoc tren Workers vi ban mac dinh tu
 * fetch yoga.wasm luc chay - Workers cam bien dich wasm dong, phai import tinh + init() 1 lan.
 */
import satori, { init as initSatori } from "satori/standalone";
// @ts-expect-error - .ttf duoc khai bao la Data module qua "rules" trong wrangler*.jsonc, khong co type khai bao san
import yogaWasm from "satori/yoga.wasm";
// @ts-expect-error - xem chu thich tren
import interRegular from "../../assets/fonts/Inter-Regular.ttf";
// @ts-expect-error - xem chu thich tren
import interSemiBold from "../../assets/fonts/Inter-SemiBold.ttf";
import { Resvg } from "@cf-wasm/resvg/workerd";

let satoriReady: Promise<void> | null = null;
function ensureSatoriInit(): Promise<void> {
  if (!satoriReady) satoriReady = initSatori(yogaWasm as ArrayBuffer);
  return satoriReady;
}

export interface BaocaoTonNhom {
  /** Nhan ngan hien tren anh, vd "MB1" */
  label: string;
  /** So ca con ton chua giai trinh (can - da), khong am */
  conTon: number;
}

/** Khop dung ten khu_vuc goc trong case_dvbh (dang "(ma) Quan ly khu vuc XXX") - CHOT 2026-08-06:
 * seu chi muon xem 6 nhom QLDVBH + KDDV tren anh Telegram, khong phai toan bo khu_vuc trong he thong
 * (truoc gui text liet ke het, bi phan nan qua nhieu/qua xau). */
export const NHOM_TELEGRAM_MAP: Record<string, string> = {
  "(qldvbh.mb1) Quản lý khu vực MB1": "MB1",
  "(qldvbh.mb2) Quản lý khu vực MB2": "MB2",
  "(qldvbh.mb3) Quản lý khu vực MB3": "MB3",
  "(qldvbh.mn1) Quản lý khu vực MN1": "MN1",
  "(qldvbh.mn2) Quản lý khu vực MN2": "MN2",
  "(qldvbh.mn3) Quản lý khu vực MN3": "MN3",
  "(qlkddv.3t) Quản lý kinh doanh dịch vụ": "KDDV",
};
const MB_ORDER = ["MB1", "MB2", "MB3"];
const MN_ORDER = ["MN1", "MN2", "MN3"];
const KDDV_ORDER = ["KDDV"];

/** entries/resolvedList dung nguyen dang tra ve tu computeTonDailyEntries (dailySnapshot.ts) - tach
 * rieng ham nay de dung chung giua cron 17h30 (chotGiaiTrinhDailyLog) va nut xem truoc cho Admin
 * (route /api/settings/telegram-report-preview). */
export function buildBaocaoTonRows(
  entries: [string, { count: number }][],
  resolvedList: number[],
): { mb: BaocaoTonNhom[]; mn: BaocaoTonNhom[]; kddv: BaocaoTonNhom[] } {
  const conTonByLabel: Record<string, number> = {};
  for (let i = 0; i < entries.length; i++) {
    const [khuVuc, bucket] = entries[i];
    const label = NHOM_TELEGRAM_MAP[khuVuc];
    if (!label) continue;
    conTonByLabel[label] = Math.max(0, bucket.count - resolvedList[i]);
  }
  const toRows = (labels: string[]) => labels.map((label) => ({ label, conTon: conTonByLabel[label] ?? 0 }));
  return { mb: toRows(MB_ORDER), mn: toRows(MN_ORDER), kddv: toRows(KDDV_ORDER) };
}

const GREEN_BG = "#EAF3DE";
const GREEN_TEXT = "#27500A";
const AMBER_BG = "#FAEEDA";
const AMBER_TEXT = "#633806";
const DARK = "#2C2C2A";
const MUTED = "#5F5E5A";

// 3 the/hang co dinh (khop khung MB1-3/MN1-3) - CARD_WIDTH tinh tay theo do rong noi dung 288px (320
// tru padding 16 x 2), 3 the + 2 khoang gap 6px. Hang KDDV chi co 1 the nen KHONG dung flex:1 (flexbox
// se keo the do gian het ca hang, khac voi CSS grid o ban demo HTML) - luon fix cung 1 kich thuoc.
const CARD_WIDTH = 92;

function card(nhom: BaocaoTonNhom) {
  const isZero = nhom.conTon === 0;
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: CARD_WIDTH,
        backgroundColor: isZero ? GREEN_BG : AMBER_BG,
        borderRadius: 6,
        padding: "6px 4px",
      },
      children: [
        {
          type: "div",
          props: { style: { fontSize: 11, fontWeight: 600, color: DARK, marginBottom: 2 }, children: nhom.label },
        },
        {
          type: "div",
          props: { style: { fontSize: 16, fontWeight: 600, color: isZero ? GREEN_TEXT : AMBER_TEXT }, children: String(nhom.conTon) },
        },
      ],
    },
  };
}

function cardRow(nhomList: BaocaoTonNhom[]) {
  return { type: "div", props: { style: { display: "flex", flexDirection: "row", gap: 6 }, children: nhomList.map(card) } };
}

function rowLabel(text: string) {
  return { type: "div", props: { style: { fontSize: 11, fontWeight: 600, color: DARK, marginBottom: 4 }, children: text } };
}

/** ngayFormatted: "dd/mm/yyyy" san sang hien thi. mb/mn phai dung 3 phan tu (MB1-3 / MN1-3), kddv 1. */
export async function renderBaocaoTonImage(mb: BaocaoTonNhom[], mn: BaocaoTonNhom[], kddv: BaocaoTonNhom[], ngayFormatted: string): Promise<Uint8Array> {
  await ensureSatoriInit();

  const tree = {
    type: "div",
    props: {
      style: {
        display: "flex",
        flexDirection: "column",
        width: 320,
        backgroundColor: "#FFFFFF",
        padding: 16,
        fontFamily: "Inter",
      },
      children: [
        { type: "div", props: { style: { fontSize: 13, fontWeight: 600, color: DARK, marginBottom: 1 }, children: "Còn tồn chưa giải trình hôm nay" } },
        { type: "div", props: { style: { fontSize: 11, color: MUTED, marginBottom: 10 }, children: `Ngày ${ngayFormatted} · chốt 17h30` } },
        rowLabel("MB"),
        { type: "div", props: { style: { display: "flex", flexDirection: "column", marginBottom: 8 }, children: [cardRow(mb)] } },
        rowLabel("MN"),
        { type: "div", props: { style: { display: "flex", flexDirection: "column", marginBottom: 8 }, children: [cardRow(mn)] } },
        rowLabel("KDDV"),
        cardRow(kddv),
      ],
    },
  };

  const svg = await satori(tree as never, {
    width: 320,
    height: 280,
    fonts: [
      { name: "Inter", data: interRegular as ArrayBuffer, weight: 400, style: "normal" },
      { name: "Inter", data: interSemiBold as ArrayBuffer, weight: 600, style: "normal" },
    ],
  });

  const resvg = await Resvg.async(svg, { fitTo: { mode: "original" } });
  return resvg.render().asPng();
}
