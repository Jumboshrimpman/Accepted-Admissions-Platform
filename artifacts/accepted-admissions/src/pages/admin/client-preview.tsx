import { useParams, Link } from "wouter";
import {
  getGetAdminClientDashboardQueryKey,
  useGetAdminClientDashboard,
} from "@workspace/api-client-react";
import { ArrowLeft, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ClientDashboardView } from "@/pages/portal/fall-welcome-dashboard";
import { ClientPreviewBookingCard } from "@/pages/portal/booking-card";
import { FinancialCard } from "@/pages/portal/financial-card";

export default function AdminClientPreview() {
  const params = useParams();
  const clientId = params.clientId as string;
  const preview = useGetAdminClientDashboard(clientId, {
    query: {
      enabled: Boolean(clientId),
      queryKey: getGetAdminClientDashboardQueryKey(clientId),
    },
  });

  if (preview.isLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-5">
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-[32rem] rounded-3xl" />
      </div>
    );
  }

  if (preview.error || !preview.data) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardContent className="space-y-4 p-8 text-center">
          <h1 className="text-xl font-semibold">Client preview unavailable</h1>
          <p className="text-sm text-muted-foreground">
            The client could not be found or this administrator is not authorized to preview the account.
          </p>
          <Button asChild variant="outline">
            <Link href="/admin/curriculum?section=people">
              <ArrowLeft className="mr-2 h-4 w-4" /> Return to clients
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-12">
      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Eye className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <h1 className="font-semibold">Administrator client preview</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              This frame uses {preview.data.user.displayName}&apos;s client-scoped data. All actions are disabled.
            </p>
          </div>
        </div>
        <Button asChild variant="outline" className="w-full sm:w-auto">
          <Link href="/admin/curriculum?section=people">
            <ArrowLeft className="mr-2 h-4 w-4" /> Return to clients
          </Link>
        </Button>
      </div>
       <div className="grid gap-5 xl:grid-cols-2">
         <FinancialCard
           previewData={preview.data.previewFinancials}
           previewOffer={preview.data.previewOffer}
           adminPreview
         />
         <ClientPreviewBookingCard
           previewBooking={preview.data.previewBooking}
           remainingHours={preview.data.previewFinancials.remainingHours}
           hasVerifiedPayment={preview.data.previewFinancials.payments.some(
             (payment) => Boolean(payment.verifiedAt) || payment.status === "paid" || payment.status === "partially_paid",
           )}
         />
       </div>
      <div className="min-w-0 overflow-x-hidden rounded-3xl border-2 border-dashed border-primary/25 bg-muted/20 p-2 sm:p-4">
        <ClientDashboardView dashboard={preview.data} adminPreview />
      </div>
    </div>
  );
}