import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, Cloud, Terminal, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({ component: HomePage });

function HomePage() {
  const features = [
    {
      icon: <Terminal className="w-10 h-10 text-cyan-400" />,
      title: "One Command Deploy",
      description:
        "Deploy your AI agent with a single CLI command. No infrastructure setup required.",
    },
    {
      icon: <Bot className="w-10 h-10 text-cyan-400" />,
      title: "Any Python Agent",
      description:
        "Support for LangChain, CrewAI, custom agents, and more. Auto-detects your entrypoint.",
    },
    {
      icon: <Cloud className="w-10 h-10 text-cyan-400" />,
      title: "Instant URL",
      description:
        "Get a public endpoint for your agent immediately. Invoke via HTTP from anywhere.",
    },
    {
      icon: <Zap className="w-10 h-10 text-cyan-400" />,
      title: "Built-in Secrets",
      description:
        "Securely manage API keys and environment variables. Encrypted at rest.",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      <header className="p-6 flex items-center justify-between max-w-7xl mx-auto">
        <div className="text-2xl font-bold text-white">Oken</div>
        <div className="flex items-center gap-4">
          <Link to="/auth/login">
            <Button variant="ghost" className="text-gray-300 hover:text-white">
              Sign in
            </Button>
          </Link>
          <Link to="/auth/signup">
            <Button className="bg-cyan-500 hover:bg-cyan-600 text-white">
              Get Started
            </Button>
          </Link>
        </div>
      </header>

      <section className="relative py-20 px-6 text-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-purple-500/10" />
        <div className="relative max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-6">
            Deploy AI Agents{" "}
            <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
              Instantly
            </span>
          </h1>
          <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
            One CLI command, get a URL. Deploy Python AI agents without managing
            infrastructure.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <Link to="/auth/signup">
              <Button
                size="lg"
                className="bg-cyan-500 hover:bg-cyan-600 text-white px-8"
              >
                Start Deploying
              </Button>
            </Link>
            <a
              href="https://docs.oken.dev"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button
                size="lg"
                variant="outline"
                className="border-slate-600 text-gray-300 hover:bg-slate-800 px-8"
              >
                Documentation
              </Button>
            </a>
          </div>
          <div className="bg-slate-800/80 rounded-lg p-4 max-w-lg mx-auto border border-slate-700">
            <code className="text-gray-300 text-sm">
              <span className="text-gray-500">$</span>{" "}
              <span className="text-cyan-400">oken</span> deploy
              <br />
              <span className="text-gray-500">Deploying my-agent...</span>
              <br />
              <span className="text-green-400">https://my-agent.oken.dev</span>
            </code>
          </div>
        </div>
      </section>

      <section className="py-16 px-6 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 hover:border-cyan-500/50 transition-colors"
            >
              <div className="mb-4">{feature.icon}</div>
              <h3 className="text-xl font-semibold text-white mb-2">
                {feature.title}
              </h3>
              <p className="text-gray-400">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="py-8 px-6 border-t border-slate-800">
        <div className="max-w-6xl mx-auto text-center text-gray-500 text-sm">
          Oken - AI Agent Deployment Platform
        </div>
      </footer>
    </div>
  );
}
