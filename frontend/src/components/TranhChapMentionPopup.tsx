import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { Btn } from "./ui/Btn";

const SESSION_KEY = "tranh-chap-mention-popup-shown";

// Popup nhac nho BAT BUOC (khac GreetingPopup - khong tu dong dong, khong dong khi click ra ngoai)
// khi tai khoan dang dang co ca tranh chap "dang cho minh xu ly" (dang_cho_nguoi_xu_ly = email minh,
// tien trinh con MO) - CHOT 2026-08-20. Chi 1 lan moi phien tab (sessionStorage, giong GreetingPopup).
// "stackedBelowGreeting" - true khi GreetingPopup dang HIEN cung luc (App.tsx theo doi qua
// GreetingPopup onVisibleChange) - popup nay se xep BEN DUOI thay vi tu tao lop nen (backdrop) rieng,
// tranh 2 lop nen chong len nhau.
function TranhChapMentionPopupInner({
  userEmail,
  stackedBelowGreeting,
  onNavigateToTranhChap,
}: {
  userEmail: string;
  stackedBelowGreeting: boolean;
  onNavigateToTranhChap: () => void;
}) {
  const { data } = useQuery({
    queryKey: ["tranh-chap-mention-count", userEmail],
    queryFn: () =>
      api.get<{ total: number }>(`/tranh-chap/tien-trinh?nguoi_dang_xu_ly=${encodeURIComponent(userEmail)}&loai_dang_xu_ly=duoc-nhac-ten&page=1&pageSize=1`),
    staleTime: 60_000,
    retry: false,
  });

  const [visible, setVisible] = useState(false);
  const triggered = useRef(false);

  useEffect(() => {
    if (triggered.current) return;
    if (data === undefined) return;
    triggered.current = true;
    if (sessionStorage.getItem(SESSION_KEY)) return;
    if ((data.total ?? 0) <= 0) return;
    setVisible(true);
  }, [data]);

  function dismiss() {
    sessionStorage.setItem(SESSION_KEY, "1");
    setVisible(false);
  }

  if (!visible || !data) return null;

  const count = data.total;
  const card = (
    <div className={`bg-white rounded-2xl shadow-2xl overflow-hidden w-full max-w-[320px] sm:max-w-[360px] anim-in`}>
      <div className="p-4 text-center space-y-3">
        <div className="text-3xl">👀</div>
        <div className="font-display font-bold text-base text-[var(--ink-800)]">
          Eh! có người đang nhắc đến bạn!!! Hãy vào thẻ "Tranh chấp, khiếu nại" và phản hồi người ta đi nhé! Có {count} vấn đề đang cần bạn xử lý đấy!
        </div>
        <div className="flex flex-col gap-2 pt-1">
          <Btn
            onClick={() => {
              dismiss();
              onNavigateToTranhChap();
            }}
          >
            Để ta xem đó là kẻ nào!
          </Btn>
          <Btn variant="ghost" onClick={dismiss}>
            Đang bận để tý nữa!
          </Btn>
        </div>
      </div>
    </div>
  );

  // Co san backdrop cua GreetingPopup dang hien - chi xep card nay BEN DUOI (offset xuong, khong tao
  // backdrop rieng de tranh 2 lop nen chong nhau).
  if (stackedBelowGreeting) {
    return (
      <div className="fixed inset-0 z-[99] flex items-start justify-center pt-[420px] pointer-events-none">
        <div className="pointer-events-auto">{card}</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" role="alertdialog">
      {card}
    </div>
  );
}

class TranhChapMentionPopupErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    /* nuot loi - khong bao gio chan trai nghiem chinh */
  }
  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

export function TranhChapMentionPopup(props: { userEmail: string; stackedBelowGreeting: boolean; onNavigateToTranhChap: () => void }) {
  return (
    <TranhChapMentionPopupErrorBoundary>
      <TranhChapMentionPopupInner {...props} />
    </TranhChapMentionPopupErrorBoundary>
  );
}
