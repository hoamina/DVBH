import { useEffect, useState } from "react";

// Ho tro nut "Cai dat vao man hinh chinh" chu dong trong app (2026-09-26, port nguyen tu
// linh-kien-app/frontend/src/hooks/usePwaInstall.ts - app ten "DVBH 3T", xem public/manifest.webmanifest) - CHI Android/desktop Chrome ho tro
// `beforeinstallprompt` (bat su kien 1 LAN duy nhat cho ca vong doi tab, phai luu module-level truoc
// khi component nao mount cung duoc). iOS Safari KHONG co API nao de tu kich hoat cai dat - noi nay
// chi bao "khong co san prompt", component goi ham nay tu quyet dinh hien huong dan thu cong rieng.
interface BeforeInstallPromptEvent extends Event {
  prompt(): void;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let listeners: Array<(v: boolean) => void> = [];

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l(true));
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    listeners.forEach((l) => l(false));
  });
}

export function isStandalonePwa(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches;
}

export function isIosSafari(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !isStandalonePwa();
}

export function usePwaInstall() {
  const [available, setAvailable] = useState(!!deferredPrompt);

  useEffect(() => {
    listeners.push(setAvailable);
    return () => {
      listeners = listeners.filter((l) => l !== setAvailable);
    };
  }, []);

  async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
    if (!deferredPrompt) return "unavailable";
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    setAvailable(false);
    return choice.outcome;
  }

  return { available, promptInstall };
}
