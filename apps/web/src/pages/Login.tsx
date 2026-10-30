import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Field, TextInput } from "../components/ui";
import { ApiError, client, unwrap } from "../lib/api";

/** The learner reads Japanese only, so no server or network message is shown as is. */
function loginError(err: Error) {
  if (err instanceof ApiError && err.status === 401) return "ユーザー名かパスワードが違います";
  if (err instanceof ApiError && err.status === 429) return "失敗が続いたので、しばらく待ってからもう一度試してください";
  return "ログインできませんでした。通信状況を確認して、もう一度試してください";
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
    <div className="pt-safe pb-safe flex min-h-dvh flex-col px-6 sm:items-center sm:justify-center">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col sm:flex-none">
        {/* the app's one page-load moment: नमस्ते sung through once, karaoke-style */}
        <div className="flex flex-1 flex-col justify-center py-12 sm:flex-none sm:pb-14">
          <p lang="ne" className="karaoke animate-wipe-once text-[92px] leading-none">
            नमस्ते
          </p>
          <p className="mt-5 text-[19px] font-bold">ネパール語を、耳から。</p>
        </div>

        <form
          className="flex flex-col gap-4 pb-8"
          onSubmit={(e) => {
            e.preventDefault();
            login.mutate();
          }}
        >
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
            <p role="alert" className="rounded-[14px] bg-miss-soft px-4 py-3 text-[15px] font-bold text-miss">
              {loginError(login.error)}
            </p>
          )}
          <Button size="lg" type="submit" className="mt-2" loading={login.isPending} disabled={!username || !password}>
            ログイン
          </Button>
        </form>
      </div>
    </div>
  );
}
