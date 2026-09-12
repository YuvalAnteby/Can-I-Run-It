import { NavLink } from 'react-router-dom';

interface FooterLink {
  label: string;
  href: string;
  comingSoon?: boolean;
}

interface FooterLinkGroup {
  title: string;
  links: FooterLink[];
}

const FOOTER_LINK_GROUPS: FooterLinkGroup[] = [
  {
    title: 'Product',
    links: [
      // TODO: Point to /games once the Games page exists
      { label: 'Games', href: '#', comingSoon: true },
      // TODO: Point to /hardware-rank once the Hardware Rank page exists
      { label: 'Hardware Rank', href: '#', comingSoon: true },
      { label: 'About', href: '/about' },
    ],
  },
  {
    title: 'Legal',
    links: [
      // TODO: Replace with the real Privacy page route
      { label: 'Privacy', href: '#', comingSoon: true },
      // TODO: Replace with the real Terms page route
      { label: 'Terms', href: '#', comingSoon: true },
      // TODO: Replace with the public API docs URL
      { label: 'API', href: '#', comingSoon: true },
    ],
  },
  {
    title: 'Social',
    links: [
      {
        label: 'GitHub',
        href: 'https://github.com/YuvalAnteby/Can-I-Run-It',
      },
    ],
  },
];

export const MainFooter = (): React.ReactElement => {
  return (
    <footer className="border-t border-gray-800 bg-[#0f1115] pt-6 pb-7">
      <div className="max-w-6xl mx-auto px-4 text-gray-600 text-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
          {FOOTER_LINK_GROUPS.map((group) => (
            <section key={group.title}>
              <h3 className="m-0 mb-2 text-[0.85rem] text-gray-400 uppercase tracking-[0.05em]">
                {group.title}
              </h3>

              <ul className="list-none m-0 p-0 flex flex-col gap-[0.35rem]">
                {group.links.map((link) => (
                  <li key={link.label}>
                    {link.comingSoon ? (
                      <button
                        type="button"
                        className="inline-flex items-center text-gray-500 bg-transparent border-0 p-0 cursor-not-allowed"
                        aria-disabled="true"
                        title="Coming soon"
                        onClick={(event) => event.preventDefault()}
                      >
                        {link.label}
                      </button>
                    ) : link.href.startsWith('/') ? (
                      <NavLink
                        to={link.href}
                        className="inline-flex items-center rounded-sm no-underline text-gray-400 transition-colors duration-200 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f1115]"
                      >
                        {link.label}
                      </NavLink>
                    ) : (
                      <a
                        href={link.href}
                        className="inline-flex items-center no-underline text-inherit transition-colors duration-200 hover:text-gray-400"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="mt-5 pt-4 border-t border-gray-800 flex flex-col justify-center items-center gap-[0.35rem]">
          <p className="m-0">&copy; 2026 Can I Run It? Project</p>
          <p className="m-0">Built by Yuval Anteby</p>
        </div>
      </div>
    </footer>
  );
};
