import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, Cloud, Terminal, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({ component: HomePage });

function HomePage() {
  const features = [
    {
      icon: <Terminal className="w-10 h-10 text-primary" />,
      title: "One Command Deploy",
      description:
        "Deploy your AI agent with a single CLI command. No infrastructure setup required.",
    },
    {
      icon: <Bot className="w-10 h-10 text-primary" />,
      title: "Any Python Agent",
      description:
        "Support for LangChain, CrewAI, custom agents, and more. Auto-detects your entrypoint.",
    },
    {
      icon: <Cloud className="w-10 h-10 text-primary" />,
      title: "Instant URL",
      description:
        "Get a public endpoint for your agent immediately. Invoke via HTTP from anywhere.",
    },
    {
      icon: <Zap className="w-10 h-10 text-primary" />,
      title: "Built-in Secrets",
      description:
        "Securely manage API keys and environment variables. Encrypted at rest.",
    },
  ];

  return (
    <div className="min-h-screen">
      <header className="p-6 flex items-center justify-between max-w-7xl mx-auto">
        <div className="text-2xl font-bold">Oken</div>
        <div className="flex items-center gap-4">
          <Link to="/auth/login">
            <Button variant="ghost">Sign in</Button>
          </Link>
          <Link to="/auth/signup">
            <Button>Get Started</Button>
          </Link>
        </div>
      </header>

      <section className="relative py-20 px-6 text-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10" />
        <div className="relative max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            Deploy AI Agents <span className="text-primary">Instantly</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            One CLI command, get a URL. Deploy Python AI agents without managing
            infrastructure.
          </p>
          <div className="flex items-center justify-center mb-12">
            <Link to="/auth/signup">
              <Button size="lg" className="px-8">
                Start Deploying
              </Button>
            </Link>
          </div>
          <div className="bg-card rounded-lg p-4 max-w-lg mx-auto border">
            <code className="text-sm">
              <span className="text-muted-foreground">$</span>{" "}
              <span className="text-primary">oken</span> deploy
              <br />
              <span className="text-muted-foreground">
                Deploying my-agent...
              </span>
              <br />
              <span className="text-green-500">
                https://&lt;your-endpoint&gt;/invoke
              </span>
            </code>
          </div>
        </div>
      </section>

      <section className="py-16 px-6 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="bg-card border rounded-xl p-6 hover:border-primary/50 transition-colors"
            >
              <div className="mb-4">{feature.icon}</div>
              <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
              <p className="text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="py-8 px-6 border-t">
        <div className="max-w-6xl mx-auto text-center text-muted-foreground text-sm">
          Oken - AI Agent Deployment Platform
        </div>
      </footer>
    </div>
  );
}
