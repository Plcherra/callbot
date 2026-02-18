import Link from "next/link";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";

export default function CallRecordingLawsPage() {
  const twoPartyStates = [
    { state: "California", link: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=PEN&sectionNum=632" },
    { state: "Connecticut", link: "https://www.cga.ct.gov/current/pub/chap_952.htm#sec_52-570d" },
    { state: "Delaware", link: "https://delcode.delaware.gov/title11/c011sc13/index.html" },
    { state: "Florida", link: "http://www.leg.state.fl.us/Statutes/index.cfm?App_mode=Display_Statute&Search_String=&URL=0800-0899/0934/Sections/0934.03.html" },
    { state: "Illinois", link: "https://www.ilga.gov/legislation/ilcs/ilcs3.asp?ActID=3498&ChapterID=48" },
    { state: "Maryland", link: "https://mgaleg.maryland.gov/mgawebsite/Laws/StatuteText?article=gcr&section=3-902" },
    { state: "Massachusetts", link: "https://malegislature.gov/Laws/GeneralLaw/PartIV/TitleI/Chapter272/Section99" },
    { state: "Michigan", link: "http://legislature.mi.gov/doc.aspx?mcl-750-539c" },
    { state: "Montana", link: "https://leg.mt.gov/bills/mca/title_45/chapter_8/parts/section_45-8-213.html" },
    { state: "New Hampshire", link: "https://gencourt.state.nh.us/rsa/html/XXX/570-A/570-A-2.htm" },
    { state: "Pennsylvania", link: "https://www.legis.state.pa.us/cfdocs/legis/li/uconsCheck.cfm?yr=2000&sessInd=0&act=18" },
    { state: "Vermont", link: "https://legislature.vermont.gov/statutes/chapter/013/Title%2013" },
    { state: "Washington", link: "https://apps.leg.wa.gov/RCW/default.aspx?cite=9.73.030" },
  ];

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8">
        <Button asChild variant="ghost" size="sm">
          <Link href="/">← Back to home</Link>
        </Button>
      </div>
      <h1 className="text-3xl font-bold">Call Recording Laws by State</h1>
      <p className="mt-2 text-muted-foreground">A short guide to one-party vs. two-party consent</p>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Overview</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm max-w-none space-y-4 text-sm">
          <p>
            In many U.S. states (e.g. California, Florida, Illinois), all-party consent is required for recording phone calls. You are responsible for complying with TCPA, state wiretapping laws, and obtaining verbal or written consent from callers when necessary.
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>One-party consent</strong>: Only one person in the conversation needs to consent (typically the recorder). Most states follow this rule.</li>
            <li><strong>Two-party (all-party) consent</strong>: All parties must be aware of and consent to the recording. The states below require this.</li>
          </ul>
          <p>
            Federal law (Wiretap Act) generally requires one-party consent, but state laws may be stricter. Always follow the stricter law in your jurisdiction. This guide is for informational purposes only—consult a legal professional for advice specific to your situation.
          </p>
        </CardContent>
      </Card>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Two-party (all-party) consent states</CardTitle>
          <p className="text-sm text-muted-foreground font-normal mt-1">
            These states require all parties to a conversation to consent before recording.
          </p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>State</TableHead>
                <TableHead>Official source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {twoPartyStates.map(({ state, link }) => (
                <TableRow key={state}>
                  <TableCell className="font-medium">{state}</TableCell>
                  <TableCell>
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline underline-offset-2 hover:text-primary/90 text-sm"
                    >
                      State statute →
                    </a>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>One-party consent</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm max-w-none text-sm">
          <p>
            All other U.S. states use one-party consent. As long as you (the recorder) are a party to the call and consent, recording is generally permitted. Some states have exceptions or special rules for certain contexts. For general reference, see{" "}
            <a
              href="https://en.wikipedia.org/wiki/Telephone_call_recording_laws"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2"
            >
              Wikipedia: Telephone call recording laws
            </a>{" "}
            or{" "}
            <a
              href="https://recordinglaw.com/united-states-recording-laws/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2"
            >
              Recording Law
            </a>.
          </p>
        </CardContent>
      </Card>

      <p className="mt-8 text-sm text-muted-foreground">
        <Link href="/privacy" className="text-primary underline underline-offset-2">Privacy Policy</Link>
        {" · "}
        <Link href="/terms" className="text-primary underline underline-offset-2">Terms of Service</Link>
        {" · "}
        <Link href="/contact" className="text-primary underline underline-offset-2">Contact</Link>
      </p>
    </main>
  );
}
