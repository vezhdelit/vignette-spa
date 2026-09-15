import { Mail, MessageCircle, Globe, ChevronRight } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { useT, type MessageKey } from "@/i18n"

// A channel's subtitle is a key only where it is prose — an address is not
// translated, so those carry a literal instead.
const CHANNELS: {
  icon: typeof Mail
  title: MessageKey
  subtitle?: MessageKey
  literal?: string
  href: string
}[] = [
  {
    icon: Mail,
    title: "support.email",
    literal: "support@vignette.id",
    href: "mailto:support@vignette.id",
  },
  {
    icon: MessageCircle,
    title: "support.telegram",
    subtitle: "support.telegramNote",
    href: "https://t.me/vignetteid",
  },
  {
    icon: Globe,
    title: "support.helpCenter",
    literal: "vignette.id",
    href: "https://vignette.id",
  },
]

export function SupportPage() {
  const { t } = useT()
  return (
    <div className="pt-2">
      <h1 className="px-1 text-[26px] font-extrabold text-white">{t("support.title")}</h1>
      <p className="mt-1 px-1 text-[15px] font-medium text-white/85">
        {t("support.intro")}
      </p>

      <div className="mt-5 space-y-3">
        {CHANNELS.map(({ icon: Icon, title, subtitle, literal, href }) => (
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
                  <span className="block text-[17px] font-extrabold text-navy">
                    {t(title)}
                  </span>
                  <span className="block text-sm font-semibold text-navy-soft">
                    {subtitle ? t(subtitle) : literal}
                  </span>
                </span>
                <ChevronRight className="size-5 text-navy-soft" />
              </CardContent>
            </Card>
          </a>
        ))}
      </div>

      <p className="mt-6 px-1 text-center text-[13px] font-medium text-white/70">
        {t("support.footer")}
      </p>
    </div>
  )
}
