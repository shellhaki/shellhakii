import { site } from "@/lib/site";
import { Clock } from "./clock";
import { Nav } from "./nav";

export function Header() {
  return (
    <header className="sticky top-0 z-50 grid grid-cols-[1fr_auto_1fr] items-center px-4 py-4 sm:px-7 sm:py-5">
      <span className="hidden text-sm sm:block">{site.timezone}</span>
      <div className="col-start-2 justify-self-center">
        <Nav />
      </div>
      <div className="hidden justify-self-end text-sm sm:block">
        <Clock timeZone={site.timezone} />
      </div>
    </header>
  );
}
