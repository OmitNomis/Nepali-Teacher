import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { Button, Card, PageHeader } from "../components/ui";
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
      <Card className="flex items-center gap-4 p-5">
        <div className="grid size-14 place-items-center rounded-full bg-gradient-to-br from-brand to-indigo text-2xl font-extrabold text-white">
          {me?.displayName.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate text-lg font-extrabold">{me?.displayName}</p>
          <p className="truncate text-sm text-muted">@{me?.username}</p>
        </div>
      </Card>
      <Button
        variant="secondary"
        className="mt-6 w-full"
        onClick={() => logout.mutate()}
        loading={logout.isPending}
      >
        <LogOut className="size-5" /> ログアウト
      </Button>
    </>
  );
}
