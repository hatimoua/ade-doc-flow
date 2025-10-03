import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { FileText, Zap, Shield, ArrowRight } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-muted/30 to-background">
      {/* Hero Section */}
      <header className="container mx-auto px-4 py-8">
        <nav className="flex items-center justify-between">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            ADE Automator
          </h1>
          <div className="flex gap-4">
            <Button variant="ghost" asChild>
              <Link to="/auth">Sign In</Link>
            </Button>
            <Button asChild>
              <Link to="/auth">Get Started</Link>
            </Button>
          </div>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="container mx-auto px-4 py-20 text-center">
          <h2 className="text-5xl md:text-6xl font-bold tracking-tight mb-6">
            Automate Your Document
            <br />
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Extraction & ERP Integration
            </span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Transform invoices and documents into structured data automatically.
            Review, validate, and push to your ERP with confidence.
          </p>
          <Button size="lg" asChild className="shadow-glow">
            <Link to="/auth">
              Start Processing Documents
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
        </section>

        {/* Features */}
        <section className="container mx-auto px-4 py-20">
          <h3 className="text-3xl font-bold text-center mb-12">
            Powerful Features for Document Automation
          </h3>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-6 rounded-lg border bg-card shadow-elegant">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <h4 className="text-xl font-semibold mb-2">Smart Extraction</h4>
              <p className="text-muted-foreground">
                Powered by Landing AI ADE, automatically extract structured data
                from invoices, receipts, and documents with high accuracy.
              </p>
            </div>

            <div className="p-6 rounded-lg border bg-card shadow-elegant">
              <div className="h-12 w-12 rounded-lg bg-accent/10 flex items-center justify-center mb-4">
                <Zap className="h-6 w-6 text-accent" />
              </div>
              <h4 className="text-xl font-semibold mb-2">Validation & Review</h4>
              <p className="text-muted-foreground">
                Built-in validation rules ensure data quality. Review and
                normalize fields before pushing to your ERP system.
              </p>
            </div>

            <div className="p-6 rounded-lg border bg-card shadow-elegant">
              <div className="h-12 w-12 rounded-lg bg-success/10 flex items-center justify-center mb-4">
                <Shield className="h-6 w-6 text-success" />
              </div>
              <h4 className="text-xl font-semibold mb-2">Secure Integration</h4>
              <p className="text-muted-foreground">
                Webhook adapters with HMAC authentication. Multi-tenant
                architecture with role-based access control.
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="container mx-auto px-4 py-20 text-center">
          <div className="max-w-3xl mx-auto p-12 rounded-2xl bg-gradient-to-r from-primary to-accent">
            <h3 className="text-3xl font-bold text-white mb-4">
              Ready to Automate Your Workflow?
            </h3>
            <p className="text-lg text-white/90 mb-8">
              Join organizations streamlining their document processing today.
            </p>
            <Button size="lg" variant="secondary" asChild>
              <Link to="/auth">
                Create Your Account
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <p>&copy; 2024 ADE Automator. Powered by Landing AI.</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
