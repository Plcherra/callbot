import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t bg-muted/30 px-6 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="grid gap-8 sm:grid-cols-3">
          <div>
            <h3 className="font-semibold">AI Receptionist</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Never miss a booking. From $49/mo.
            </p>
          </div>
          <div>
            <h3 className="font-semibold">Product</h3>
            <ul className="mt-2 space-y-1 text-sm">
              <li>
                <Link href="/signup" className="text-muted-foreground hover:text-foreground">
                  Sign up
                </Link>
              </li>
              <li>
                <Link href="/login" className="text-muted-foreground hover:text-foreground">
                  Log in
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
                  Dashboard
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold">Company</h3>
            <ul className="mt-2 space-y-1 text-sm">
              <li>
                <Link href="/about" className="text-muted-foreground hover:text-foreground">
                  About
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-muted-foreground hover:text-foreground">
                  Contact
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-muted-foreground hover:text-foreground">
                  Privacy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-muted-foreground hover:text-foreground">
                  Terms
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-8 border-t pt-6 text-center text-sm text-muted-foreground">
          © 2026 AI Receptionist. Based in Massachusetts.
        </div>
      </div>
    </footer>
  );
}
