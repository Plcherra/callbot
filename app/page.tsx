import { Hero } from "@/app/components/landing/Hero";
import { Pricing } from "@/app/components/landing/Pricing";
import { Testimonials } from "@/app/components/landing/Testimonials";

export default function HomePage() {
  return (
    <main>
      <Hero />
      {/* Demo video: set NEXT_PUBLIC_DEMO_VIDEO_ID to your YouTube video ID (e.g. abc123) for https://www.youtube.com/embed/abc123 */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">
            See it in action
          </h2>
          <div className="mt-8 aspect-video overflow-hidden rounded-lg bg-muted">
            <iframe
              className="h-full w-full"
              src={`https://www.youtube.com/embed/${process.env.NEXT_PUBLIC_DEMO_VIDEO_ID || "dQw4w9WgXcQ"}`}
              title="Product demo"
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
