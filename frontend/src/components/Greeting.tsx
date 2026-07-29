import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

interface GreetingResponse {
  timeOfDay: string;
  weather: { city: string; tempC: number; isHot: boolean; isCold: boolean; isRain: boolean; isFog: boolean } | null;
  namePrefix: string;
  message: string;
}

// Chi tinh nang trang tri - bat cu loi gi (mang, timeout, backend that bai) deu chi lam khoi nay
// bien mat, khong hien loi, khong lam vo phan con lai cua TopBar.
function GreetingInner() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["greeting"],
    queryFn: () => api.get<GreetingResponse>("/greeting"),
    staleTime: 30 * 60_000,
    retry: false,
  });

  // Ban chao "nang cap" boi Gemini (xem routes/greeting.ts GET /ai) - goi RIENG, chi bat dau SAU
  // khi ban mau (data.message tu buildGreeting()) da co san, khong bao gio lam cham/chan lan hien
  // dau tien. "message: null" (loi mang/AI khong san sang) hoac chua co ket qua -> displayMessage
  // ben duoi tu dong roi ve ban mau, khong hien loi/khoang trong.
  const { data: aiData } = useQuery({
    queryKey: ["greeting-ai"],
    queryFn: () => api.get<{ message: string | null }>("/greeting/ai"),
    staleTime: 30 * 60_000,
    retry: false,
    enabled: !!data,
  });

  const displayMessage = aiData?.message ?? data?.message;

  const boxRef = useRef<HTMLDivElement>(null);
  const [needsScroll, setNeedsScroll] = useState(false);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    // scrollWidth do duoc do o trang thai chua cuon (chua gan class marquee) nen phan anh dung
    // do rong that cua ca cau, so voi khoang trong thuc te (clientWidth) de quyet dinh co can
    // cuon hay khong - cau ngan vua khung thi hien tinh, khong cuon vo ich. Chay lai khi
    // displayMessage doi (vd ban AI vua thay vao ban mau) de do lai dung do rong cau moi.
    setNeedsScroll(el.scrollWidth > el.clientWidth + 1);
  }, [data?.namePrefix, displayMessage]);

  if (isLoading || isError || !data) return null;

  // min-w-0 + flex-1 de chiem het khoang trong con lai giua o tim kiem va nhom icon ben phai.
  // Cau chao thuong dai hon khoang trong nay nhieu - thay vi cat mat chu (truncate), cho chay
  // ngang kieu bang tin (marquee) de cuoi cung van doc duoc het ca cau. Phan "Chao {Ten} {cach
  // goi}" to dam rieng, phan noi dung con lai giu kieu chu thuong.
  return (
    <div ref={boxRef} className="hidden lg:block min-w-0 flex-1 overflow-hidden whitespace-nowrap text-sm text-[var(--ink-600)]">
      <span className={needsScroll ? "greeting-marquee" : undefined}>
        <b className="font-bold">{data.namePrefix}</b>, {displayMessage}
      </span>
    </div>
  );
}

// Error boundary rieng vi day la cach duy nhat bat loi throw trong luc render/effect cua React -
// try/catch thuong khong bat duoc. Bat ky loi nao cung chi an het khoi nay, khong lam sap TopBar.
class GreetingErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    /* nuot loi - tinh nang phu, khong bao cao len */
  }
  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

export function Greeting() {
  return (
    <GreetingErrorBoundary>
      <GreetingInner />
    </GreetingErrorBoundary>
  );
}
