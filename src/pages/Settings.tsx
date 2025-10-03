import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Settings2, Link2 } from "lucide-react";

const Settings = () => {
  const navigate = useNavigate();

  return (
    <Layout>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Settings</h1>
        
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              <CardTitle>ERP Connections</CardTitle>
            </div>
            <CardDescription>
              Manage your integrations with QuickBooks, Xero, NetSuite, Webhooks, and CSV exports
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/connections")}>
              <Settings2 className="h-4 w-4 mr-2" />
              Manage Connections
            </Button>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Settings;