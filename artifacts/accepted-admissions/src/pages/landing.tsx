import { Link } from "wouter";
import { Show } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { ArrowRight, BookOpen, GraduationCap, Users } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <header className="container mx-auto px-6 h-20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="Accepted Admissions" className="w-10 h-10 rounded-xl shadow-sm" />
          <span className="font-bold text-xl tracking-tight text-foreground">
            Accepted Admissions
          </span>
        </div>
        <div className="flex items-center gap-4">
            <Show when="signed-out">
            <Link href="/login">
              <Button variant="ghost" className="font-medium">Sign In</Button>
            </Link>
            <Link href="/login">
              <Button className="bg-primary text-primary-foreground font-medium rounded-full px-6">
                Client Portal
              </Button>
            </Link>
            </Show>
            <Show when="signed-in">
            <Link href="/portal">
              <Button className="bg-primary text-primary-foreground font-medium rounded-full px-6">
                Go to Portal
              </Button>
            </Link>
            </Show>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden pt-20 pb-32">
          {/* Abstract background shapes */}
          <div className="absolute top-0 right-0 -mr-32 -mt-32 w-[600px] h-[600px] bg-accent/10 rounded-full blur-[100px] pointer-events-none" />
          <div className="absolute bottom-0 left-0 -ml-32 -mb-32 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[100px] pointer-events-none" />
          
          <div className="container mx-auto px-6 relative z-10 flex flex-col items-center text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 text-accent font-medium text-sm mb-8">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
              </span>
              Enrollment for Fall is Open
            </div>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-foreground max-w-4xl leading-tight">
              Personalized guidance for your <span className="text-gradient-brand">highest ambitions</span>
            </h1>
            <p className="mt-8 text-xl text-muted-foreground max-w-2xl leading-relaxed">
              We provide high-touch, tailored tutoring and admissions consulting for students who aim higher. Your journey, our expertise.
            </p>
            <div className="mt-12 flex flex-col sm:flex-row items-center gap-4">
                <Show when="signed-out">
                <Link href="/login">
                  <Button size="lg" className="rounded-full px-8 h-14 text-base bg-gradient-brand text-white border-0 shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 transition-all">
                    Client Sign In <ArrowRight className="ml-2 w-5 h-5" />
                  </Button>
                </Link>
                </Show>
                <Show when="signed-in">
                <Link href="/portal">
                  <Button size="lg" className="rounded-full px-8 h-14 text-base bg-gradient-brand text-white border-0 shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 transition-all">
                    Enter Portal <ArrowRight className="ml-2 w-5 h-5" />
                  </Button>
                </Link>
                </Show>
            </div>
          </div>
        </section>

        {/* Feature Section */}
        <section className="py-24 bg-card border-y">
          <div className="container mx-auto px-6">
            <div className="grid md:grid-cols-3 gap-12">
              <div className="flex flex-col items-start text-left">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-6">
                  <GraduationCap className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-3">Expert Instruction</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Learn from educators who have mastered their fields and understand the nuanced demands of top-tier admissions.
                </p>
              </div>
              <div className="flex flex-col items-start text-left">
                <div className="w-12 h-12 rounded-2xl bg-accent/10 text-accent flex items-center justify-center mb-6">
                  <BookOpen className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-3">Bespoke Curriculum</h3>
                <p className="text-muted-foreground leading-relaxed">
                  No cookie-cutter test prep. Every session, assignment, and milestone is calibrated to your specific goals and learning style.
                </p>
              </div>
              <div className="flex flex-col items-start text-left">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-6">
                  <Users className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-3">High-Touch Support</h3>
                <p className="text-muted-foreground leading-relaxed">
                  We maintain a small client roster by design, ensuring you have direct access to your team when you need them most.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-background py-12 border-t mt-auto">
        <div className="container mx-auto px-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <img src="/logo.svg" alt="Accepted Admissions" className="w-6 h-6 rounded-md opacity-50 grayscale" />
            <span className="font-semibold text-muted-foreground">Accepted Admissions</span>
          </div>
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Accepted Admissions. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}