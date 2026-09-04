import { getListTutorPayoutsQueryKey, useListTutorPayouts } from "@workspace/api-client-react";
import { WalletCards } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function TutorPayoutsCard() {
  const payouts = useListTutorPayouts({
    query: { queryKey: getListTutorPayoutsQueryKey(), staleTime: 10_000 },
  });

  if (payouts.isLoading) {
    return <Skeleton className="h-48 rounded-2xl" />;
  }

  if (payouts.error) {
    return null;
  }

  const rows = payouts.data ?? [];

  return (
    <Card className="overflow-hidden shadow-sm">
      <CardHeader className="border-b px-6 py-5 sm:px-7">
        <CardTitle className="flex items-center gap-2 text-xl">
          <WalletCards className="h-5 w-5 text-primary" />
          My payouts
        </CardTitle>
        <CardDescription className="mt-1">
          Your completed-session payables and payment status. Company-wide finances stay with administrators.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-6 py-5 sm:px-7">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No payout obligations yet. Amounts become due after a session is marked completed.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-2">Student</th>
                  <th className="p-2">Session</th>
                  <th className="p-2">Amount</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b">
                    <td className="p-2">{row.studentName ?? "Student"}</td>
                    <td className="p-2">
                      <p>{new Date(row.sessionDateTime).toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">{row.durationMinutes} min</p>
                    </td>
                    <td className="p-2 font-medium">{money(row.amountOwedCents)}</td>
                    <td className="p-2">
                      <Badge variant="outline" className="capitalize">
                        {row.status}
                      </Badge>
                      {row.paidAt && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Paid {new Date(row.paidAt).toLocaleDateString()}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
