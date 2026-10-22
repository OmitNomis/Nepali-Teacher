import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Field, TextInput } from "../components/ui";
import { client, unwrap } from "../lib/api";

/** Dusk over the Himalaya: layered ridges in the flag's crimson and blue. */
function Scene() {
  return (
    <div className="absolute inset-0 bg-gradient-to-b from-[#2a1747] via-[#8e1b3f] to-[#e2475a]" aria-hidden>
      <div className="absolute top-[15%] right-[9%] size-12 rounded-full bg-[#ffe3c2] opacity-90" />
      <div className="absolute top-[15%] right-[9%] size-12 scale-[2.8] rounded-full bg-[#ffd6a8] opacity-15 blur-2xl" />
      {[
        { top: "12%", left: "18%" },
        { top: "8%", left: "42%" },
        { top: "22%", left: "8%" },
        { top: "5%", left: "70%" },
        { top: "28%", left: "58%" },
      ].map((pos, i) => (
        <span key={i} className="absolute size-1 rounded-full bg-white/70" style={pos} />
      ))}
      <svg className="absolute inset-x-0 bottom-0 h-[58%] w-full" viewBox="0 0 400 300" preserveAspectRatio="none">
        {/* far snowy range */}
        <path
          d="M0 300 V150 L40 120 L75 140 L120 70 L150 100 L185 60 L230 115 L270 90 L310 125 L350 85 L400 120 V300 Z"
          fill="#f6d9df"
          opacity="0.35"
        />
        <path d="M120 70 L108 90 L120 84 L131 92 Z M185 60 L172 82 L186 75 L198 84 Z" fill="white" opacity="0.6" />
        {/* mid ridge */}
        <path
          d="M0 300 V190 L55 160 L100 185 L160 140 L215 180 L260 155 L320 190 L365 165 L400 180 V300 Z"
          fill="#24408f"
          opacity="0.85"
        />
        {/* near hills */}
        <path d="M0 300 V230 C70 205 130 225 200 215 C270 205 330 228 400 210 V300 Z" fill="#162a66" />
      </svg>
    </div>
  );
}

export function Login() {
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const login = useMutation({
    mutationFn: () => unwrap(client.auth.login.$post({ json: { username, password } })),
    onSuccess: (r) => qc.setQueryData(["me"], r.user),
  });

  return (
    <div className="relative flex min-h-dvh flex-col bg-[#162a66]">
      <div className="relative min-h-[44dvh] flex-1 overflow-hidden">
        <Scene />
        <div className="pt-safe relative">
          <div className="px-6 pt-[9dvh] text-center text-white">
            <p lang="ne" className="text-[64px] leading-tight font-semibold drop-shadow-[0_2px_12px_rgb(0_0_0/0.25)]">
              नमस्ते
            </p>
            <p className="font-display mt-3 text-[17px] font-bold opacity-90">ネパール語を、耳から。</p>
          </div>
        </div>
      </div>

      <form
        className="animate-sheet pb-safe relative -mt-7 rounded-t-[32px] bg-bg px-6 pt-7"
        onSubmit={(e) => {
          e.preventDefault();
          login.mutate();
        }}
      >
        <div className="mx-auto flex w-full max-w-sm flex-col gap-4 pb-8">
          <h1 className="font-display text-[22px] font-extrabold">ようこそ</h1>
          <Field label="ユーザー名">
            {(id) => (
              <TextInput
                id={id}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            )}
          </Field>
          <Field label="パスワード">
            {(id) => (
              <TextInput
                id={id}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
          </Field>
          {login.error && (
            <p className="rounded-2xl bg-brand-soft px-4 py-3 text-sm font-bold text-brand">
              {login.error.message === "Wrong username or password"
                ? "ユーザー名かパスワードが違います"
                : login.error.message}
            </p>
          )}
          <Button size="lg" type="submit" className="mt-2" loading={login.isPending} disabled={!username || !password}>
            ログイン
          </Button>
        </div>
      </form>
    </div>
  );
}
