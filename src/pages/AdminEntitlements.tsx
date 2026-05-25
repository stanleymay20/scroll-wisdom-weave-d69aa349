import { AdminEntitlementsTab } from "@/components/admin/AdminEntitlementsTab";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function AdminEntitlements() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Entitlements & Subscriptions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Direct admin console for creator tiers, Stripe state, grace periods, and publishing access.
          </p>
        </div>

        <Button variant="outline" size="sm" asChild>
          <Link to="/admin/ops">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to AdminOps
          </Link>
        </Button>
      </div>

      <AdminEntitlementsTab />
    </div>
  );
}
