import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, BookOpen, Clock3 } from "lucide-react";
import { ProjectsAppPowerKProvider } from "@/components/power-k/projects-app-provider";
import { PageHead } from "@/components/core/page-title";

type Props = { app: "Wiki" | "Timesheet" };

/** Landing screens keep navigation usable while the corresponding modules are built. */
export function WorkspaceAppPlaceholder({ app }: Props) {
  const { workspaceSlug } = useParams();
  const Icon = app === "Wiki" ? BookOpen : Clock3;

  return (
    <>
      <PageHead title={app} />
      <ProjectsAppPowerKProvider />
      <main className="flex size-full min-w-0 flex-col overflow-y-auto rounded-lg border border-subtle bg-surface-1">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-subtle px-5 text-14 text-primary">
          <Icon className="size-4 text-tertiary" aria-hidden="true" />
          {app}
        </header>
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
          <Icon className="mb-5 size-9 text-tertiary" aria-hidden="true" />
          <h1 className="text-24 font-semibold text-primary">{app}</h1>
          <p className="mt-3 max-w-md text-14 leading-relaxed text-secondary" lang="th">
            {app === "Wiki"
              ? "พื้นที่เอกสารและความรู้ของทีม จะพัฒนา Collections และการจัดการเอกสารในขั้นถัดไป"
              : "พื้นที่บันทึกเวลาทำงานรายสัปดาห์ จะพัฒนาการกรอกเวลาและส่งตรวจในขั้นถัดไป"}
          </p>
          <p className="mt-2 text-13 text-tertiary" lang="th">
            ส่วนนี้ยังไม่เปิดใช้งาน
          </p>
          <Link
            href={`/${workspaceSlug}/`}
            className="mt-6 inline-flex items-center gap-2 rounded-md border border-subtle px-4 py-2 text-13 font-medium text-primary hover:bg-layer-transparent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            <span lang="th">กลับไปที่ Work</span>
          </Link>
        </div>
      </main>
    </>
  );
}
