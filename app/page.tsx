import { Hero } from "@/app/components/landing/Hero";
import { Pricing } from "@/app/components/landing/Pricing";
import { Testimonials } from "@/app/components/landing/Testimonials";

export default function HomePage() {
  return (
    <main>
      <Hero />
      {/* Demo video placeholder - replace src with your YouTube/Vimeo embed */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">
            See it in action
          </h2>
          <div className="mt-8 aspect-video overflow-hidden rounded-lg bg-muted">
            <iframe
              className="h-full w-full"
              src="https://www.youtube.com/embed/dQw4w9WgXcQ"
              title="Demo"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      </section>
      <Pricing />
      <Testimonials />
    </main>
  );
}
