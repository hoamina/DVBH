import { napTuDien } from "./i18n/tr";

// Nap tu dien ngon ngu giao dien (chi khi khac tieng Viet) TRUOC khi import app - xem i18n/tr.ts. Loi nap tu dien thi van
// chay app (hien tieng Viet) thay vi trang trang.
void napTuDien()
  .catch(() => undefined)
  .then(() => import("./bootstrap"));
