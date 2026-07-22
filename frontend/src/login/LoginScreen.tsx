export function LoginScreen({ variant = "login" }: { variant?: "login" | "pending" | "rejected" }) {
  const messages: Record<string, { title: string; sub: string }> = {
    login: { title: "Ông Thợ 3T - DVBH", sub: "Hệ thống quản lý giải trình tồn & SLA nội bộ" },
    pending: { title: "Đang chờ duyệt", sub: "Tài khoản của bạn đã được ghi nhận, vui lòng chờ Admin phê duyệt và gán vai trò." },
    rejected: { title: "Tài khoản bị từ chối", sub: "Liên hệ Admin nếu bạn cho rằng đây là nhầm lẫn." },
  };
  const { title, sub } = messages[variant];

  return (
    <div className="min-h-screen ripple-bg flex items-center justify-center" style={{ background: "linear-gradient(160deg, var(--ocean-950), var(--ocean-800))" }}>
      <div className="bg-white rounded-3xl shadow-2xl p-10 w-full max-w-sm text-center anim-in">
        <img src="/logo-37.png" alt="Ông Thợ 3T" width={52} height={52} className="mx-auto mb-3 rounded-xl" />
        <div className="font-display font-extrabold text-xl mb-1">{title}</div>
        <div className="text-sm text-[var(--ink-400)] mb-7">{sub}</div>
        {variant === "login" && (
          <a
            href="/api/auth/login"
            className="focus-ring w-full flex items-center justify-center gap-2.5 border border-[var(--line)] rounded-xl py-2.5 font-semibold text-sm hover:bg-slate-50 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l6-6C34.1 5.1 29.3 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.3-.1-2.7-.4-4z" />
              <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.5 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l6-6C34.1 5.1 29.3 3 24 3 16.3 3 9.7 7.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 45c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 36.6 26.7 37.5 24 37.5c-5.3 0-9.7-3.6-11.3-8.4l-6.5 5C9.5 40.6 16.2 45 24 45z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.9 2.6-2.5 4.8-4.7 6.3l6.2 5.2C40.5 36.2 44 30.6 44 24c0-1.3-.1-2.7-.4-3.5z" />
            </svg>
            Đăng nhập bằng Google
          </a>
        )}
        {variant === "login" && (
          <div className="text-xs text-[var(--ink-400)] mt-5">Chỉ tài khoản đã được Admin phê duyệt mới truy cập được hệ thống.</div>
        )}
      </div>
    </div>
  );
}
