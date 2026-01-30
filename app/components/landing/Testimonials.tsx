import {
  Card,
  CardContent,
} from "@/app/components/ui/card";

const testimonials = [
  {
    quote: "We went from missing half our after-hours calls to zero. The bot books directly into our calendar.",
    author: "Maria L.",
    role: "Salon owner",
  },
  {
    quote: "Set up in 10 minutes. Our clients think they're talking to a real person. Game changer.",
    author: "James T.",
    role: "Barbershop",
  },
  {
    quote: "Finally something that works for small businesses. Worth every penny.",
    author: "Sarah K.",
    role: "Spa & wellness",
  },
];

export function Testimonials() {
  return (
    <section className="bg-muted/50 px-6 py-16 sm:py-24">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
          What owners are saying
        </h2>
        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {testimonials.map((t) => (
            <Card key={t.author}>
              <CardContent className="pt-6">
                <p className="text-muted-foreground">&ldquo;{t.quote}&rdquo;</p>
                <p className="mt-4 font-medium">{t.author}</p>
                <p className="text-sm text-muted-foreground">{t.role}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
