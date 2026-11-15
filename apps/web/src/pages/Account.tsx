import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, LogOut } from "lucide-react";
import { useNavigate } from "react-router";
import { Avatar, List, PageHeader } from "../components/ui";
import { client, unwrap } from "../lib/api";
import { useMe } from "../lib/queries";

export function Account() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const logout = useMutation({
    mutationFn: () => unwrap(client.auth.logout.$post()),
    onSuccess: () => {
      // the next login starts on home, not back on this page
      navigate("/", { replace: true });
      // set "me" in place: qc.clear() detached the App from it, so this page
      // stayed on screen instead of the login form
      qc.setQueryData(["me"], null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
    },
  });

  return (
    <div className="mx-auto w-full max-w-md">
      <PageHeader back="/" title="アカウント" />
      <div className="flex items-center gap-4 pb-8">
        {me && <Avatar name={me.displayName} className="size-16 text-[26px]" />}
        <div className="min-w-0">
          <p className="truncate text-[22px] font-bold">{me?.displayName}</p>
          <p className="truncate text-[15px] text-muted">{me?.username}</p>
        </div>
      </div>
      <List>
        <button
          type="button"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
          className="press flex w-full items-center gap-3 px-4 py-4 text-left font-bold hover:bg-surface-2/60 active:bg-surface-2"
        >
          {logout.isPending ? <LoaderCircle className="size-5 animate-spin" /> : <LogOut className="size-5 text-muted" />}
          ログアウト
        </button>
      </List>
    </div>
  );
}
