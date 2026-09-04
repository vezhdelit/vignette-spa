import { Mail, MessageCircle, Globe, ChevronRight } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

const CHANNELS = [
  {
    icon: Mail,
    title: "Email us",
    subtitle: "support@vignette.id",
    href: "mailto:support@vignette.id",
  },
  {
    icon: MessageCircle,
    title: "Telegram",
    subtitle: "Fastest replies, 24/7",
    href: "https://t.me/vignetteid",
  },
  {
    icon: Globe,
    title: "Help center",
    subtitle: "vignette.id",
    href: "https://vignette.id",
  },
]

export function SupportPage() {
  return (
    <div className="pt-2">
      <h1 className="px-1 text-[26px] font-extrabold text-white">Support</h1>
      <p className="mt-1 px-1 text-[15px] font-medium text-white/85">
        Questions about an order, a refund or a fine? We're here to help.
      </p>

      <div className="mt-5 space-y-3">
        {CHANNELS.map(({ icon: Icon, title, subtitle, href }) => (
          <a
            key={title}
            href={href}
            target={href.startsWith("http") ? "_blank" : undefined}
            rel="noreferrer"
            className="block rounded-[24px] transition active:scale-[0.99]"
          >
            <Card className="rounded-[24px] shadow-[0_8px_24px_rgba(0,60,120,0.1)] ring-0">
              <CardContent className="flex items-center gap-4">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft/60">
                  <Icon className="size-6 text-brand" />
                </span>
                <span className="flex-1">
                  <span className="block text-[17px] font-extrabold text-navy">{title}</span>
                  <span className="block text-sm font-semibold text-navy-soft">
                    {subtitle}
                  </span>
                </span>
                <ChevronRight className="size-5 text-navy-soft" />
              </CardContent>
            </Card>
          </a>
        ))}
      </div>

      <p className="mt-6 px-1 text-center text-[13px] font-medium text-white/70">
        When writing about an order, include the plate number and the order id —
        you'll find both on the Home tab.
      </p>
    </div>
  )
}
