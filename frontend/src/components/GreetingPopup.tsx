import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { GreetingGifRow, GreetingMessageRow } from "../types";

const SESSION_KEY = "greeting-popup-shown";
const AUTO_DISMISS_MS = 5000;
// Trong 1s dau, click/phim BI BO QUA - tranh dong ngay lap tuc do 1 cu click/go phim con "dang tay"
// tu truoc khi popup kip xuat hien (vd nguoi dung dang go do khi trang moi tai xong).
const EARLY_DISMISS_GRACE_MS = 1000;
const EXIT_ANIM_MS = 200;

// Popup chao mung ngau nhien (GIF + loi chao, quan ly qua Settings > "Loi chao") khi dang nhap/mo
// lai web - CHOT 2026-08-02. Chi tinh nang trang tri: bat ky loi gi (mang, danh sach rong) deu chi
// lam popup khong hien, khong bao gio chan trai nghiem con lai (dung nguyen tac voi Greeting.tsx).
function GreetingPopupInner() {
  const { data: gifData } = useQuery({
    queryKey: ["settings-greeting-gif"],
    queryFn: () => api.get<{ rows: GreetingGifRow[] }>("/settings/greeting-gif"),
    staleTime: 30 * 60_000,
    retry: false,
  });
  const { data: messageData } = useQuery({
    queryKey: ["settings-greeting-message"],
    queryFn: () => api.get<{ rows: GreetingMessageRow[] }>("/settings/greeting-message"),
    staleTime: 30 * 60_000,
    retry: false,
  });

  const [picked, setPicked] = useState<{ gif: string; message: string } | null>(null);
  const [visible, setVisible] = useState(false);
  const triggered = useRef(false);

  useEffect(() => {
    if (triggered.current) return;
    if (!gifData || !messageData) return;
    // sessionStorage: xoa khi dong tab/trinh duyet - khop dung "dang nhap hoac mo lai web" (1 lan
    // moi phien tab), khong hien lai o moi lan refresh/dieu huong noi bo trong cung phien.
    if (sessionStorage.getItem(SESSION_KEY)) {
      triggered.current = true;
      return;
    }
    const gifs = gifData.rows.filter((r) => r.bat_tat);
    const messages = messageData.rows.filter((r) => r.bat_tat);
    if (gifs.length === 0 || messages.length === 0) {
      triggered.current = true;
      return;
    }
    triggered.current = true;
    sessionStorage.setItem(SESSION_KEY, "1");
    const gif = gifs[Math.floor(Math.random() * gifs.length)].gif_url;
    const message = messages[Math.floor(Math.random() * messages.length)].noi_dung;
    setPicked({ gif, message });
    setVisible(true);
  }, [gifData, messageData]);

  const shownAt = useRef(0);
  // Dung chung cho ca listener "phim bat ky" (duoi) lan click tren overlay (PopupShell ben duoi) -
  // chi 1 noi dinh nghia "da qua grace period chua".
  function dismissIfPastGrace() {
    if (Date.now() - shownAt.current >= EARLY_DISMISS_GRACE_MS) setVisible(false);
  }

  useEffect(() => {
    if (!visible) return;
    shownAt.current = Date.now();
    const autoTimer = setTimeout(() => setVisible(false), AUTO_DISMISS_MS);
    // Sau EARLY_DISMISS_GRACE_MS: bat ky phim nao (khong chi Escape) deu dong ngay - "an bat ky
    // phim hoac nut bam nao" theo yeu cau (nut bam = click tren overlay, xem PopupShell onDismiss).
    window.addEventListener("keydown", dismissIfPastGrace);
    return () => {
      clearTimeout(autoTimer);
      window.removeEventListener("keydown", dismissIfPastGrace);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!picked) return null;
  // Sau khi visible=false, giu render them EXIT_ANIM_MS de choi het hieu ung fade-out roi moi go
  // han khoi DOM (khong dung onAnimationEnd - click de dismiss som khong luon kich hoat lai
  // animation, setTimeout chac chan hon).
  return (
    <PopupShell visible={visible} gif={picked.gif} message={picked.message} onDismiss={dismissIfPastGrace} />
  );
}

function PopupShell({ visible, gif, message, onDismiss }: { visible: boolean; gif: string; message: string; onDismiss: () => void }) {
  const [mounted, setMounted] = useState(true);
  useEffect(() => {
    if (visible) return;
    const t = setTimeout(() => setMounted(false), EXIT_ANIM_MS);
    return () => clearTimeout(t);
  }, [visible]);

  if (!mounted) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm cursor-pointer"
      onClick={onDismiss}
      role="status"
    >
      <div
        className={`bg-white rounded-2xl shadow-2xl overflow-hidden w-full max-w-[320px] sm:max-w-[360px] ${visible ? "greeting-pop-in" : "greeting-pop-out"}`}
      >
        <img src={gif} alt="" className="w-full aspect-square object-cover" />
        <div className="p-4 text-center">
          <div className="font-display font-bold text-base text-[var(--ink-800)]">{message}</div>
        </div>
      </div>
    </div>
  );
}

class GreetingPopupErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
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

export function GreetingPopup() {
  return (
    <GreetingPopupErrorBoundary>
      <GreetingPopupInner />
    </GreetingPopupErrorBoundary>
  );
}
