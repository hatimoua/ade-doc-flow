import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const Records = () => {
  return (
    <Layout>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Records Queue</h1>
        <Card>
          <CardHeader>
            <CardTitle>Pending Records</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-center py-8">
              Records review functionality coming soon
            </p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Records;