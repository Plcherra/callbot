export function Footer() {
  const APP_STORE = "https://apps.apple.com/app/echodesk";
  const PLAY_STORE = "https://play.google.com/store/apps/details?id=com.echodesk.app";

  return (
    <footer className="border-t bg-muted/30 px-6 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="grid gap-8 sm:grid-cols-3">
          <div>
            <h3 className="font-semibold">AI Receptionist</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Never miss a booking. Download the app to get started.
            </p>
          </div>
          <div>
            <h3 className="font-semibold">Download</h3>
            <ul className="mt-2 space-y-1 text-sm">
              <li>
                <a href={APP_STORE} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                  App Store
                </a>
              </li>
              <li>
                <a href={PLAY_STORE} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                  Google Play
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold">Support</h3>
            <ul className="mt-2 space-y-1 text-sm">
              <li>
                <a href="mailto:support@echodesk.us" className="text-muted-foreground hover:text-foreground">
                  Contact
                </a>
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
