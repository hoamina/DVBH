import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./auth/AuthContext";
import { ToastProvider } from "./components/ui/Toast";
import { App } from "./App";
import "./styles/tokens.css";

const queryClient = new QueryClient({
  defaultOptions: {
    // staleTime mac dinh 2 phut - truoc day la 0 (moi lan component mount lai, vd chuyen qua lai
    // giua cac tab Dashboard/Backlog/Ca lap, deu goi lai TOAN BO API tu dau du du lieu chua doi gi).
    // Voi 1 he thong bao cao noi bo, "cham" 2 phut la chap nhan duoc, doi lai giam manh chi phi D1
    // rows-read (xem phan tich chi phi D1 2026-07-22) - cac cho can du lieu tuc thi sau khi ghi
    // (giai trinh, chot vi pham...) da tu goi qc.invalidateQueries() rieng, KHONG bi anh huong boi
    // staleTime nay (invalidateQueries luon buoc refetch bat ke con "fresh" hay khong).
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 2 * 60_000 },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
