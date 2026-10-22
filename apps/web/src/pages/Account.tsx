import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, LogOut } from "lucide-react";
import { List, PageHeader } from "../components/ui";
import { client, unwrap } from "../lib/api";
import { useMe } from "../lib/queries";

export function Account() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const logout = useMutation({
    mutationFn: () => unwrap(client.auth.logout.$post()),
    onSuccess: () => {
      qc.clear();
      qc.setQueryData(["me"], null);
    },
  });

  return (
    <>
      <PageHeader title="アカウント" />
      <div className="animate-pop flex flex-col items-center pt-2 pb-8 text-center">
        <div className="font-display grid size-24 place-items-center rounded-full bg-gradient-to-br from-brand to-indigo text-4xl font-extrabold text-white shadow-lift">
          {me?.displayName.slice(0, 1).toUpperCase()}
        </div>
        <p className="font-display mt-4 text-[22px] font-extrabold">{me?.displayName}</p>
        <p className="text-[15px] text-muted">@{me?.username}</p>
      </div>
      <List>
        <button
          type="button"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
          className="press flex w-full items-center gap-3 px-4 py-4 text-left font-bold text-brand active:bg-surface-2"
        >
          {logout.isPending ? <LoaderCircle className="size-5 animate-spin" /> : <LogOut className="size-5" />}
          ログアウト
        </button>
      </List>
    </>
  );
}
