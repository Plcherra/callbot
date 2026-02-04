"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/app/components/ui/button";
import { cn } from "@/lib/utils";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/receptionists", label: "My Receptionists" },
  { href: "/settings", label: "Settings" },
  { href: "/help", label: "Help" },
];

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-2">
      {links.map((link) => (
        <Button
          key={link.href}
          asChild
          variant={pathname === link.href ? "secondary" : "ghost"}
          size="sm"
        >
          <Link href={link.href}>{link.label}</Link>
        </Button>
      ))}
    </nav>
  );
}
