import { CheckCircle, Cpu, Search } from 'lucide-react';
import type { ReactElement } from 'react';

interface Step {
  icon: ReactElement;
  number: number;
  title: string;
  description: string;
}

const STEPS: Step[] = [
  {
    icon: <Search size={28} aria-hidden="true" />,
    number: 1,
    title: 'Search a Game',
    description:
      'Type any game title in the search bar and select it from thousands of supported titles.',
  },
  {
    icon: <Cpu size={28} aria-hidden="true" />,
    number: 2,
    title: 'Enter Your Specs',
    description:
      'Tell us your CPU and GPU model. No benchmark scores needed — just pick from the list.',
  },
  {
    icon: <CheckCircle size={28} aria-hidden="true" />,
    number: 3,
    title: 'Get Your Result',
    description:
      'Instantly see whether your rig can handle the game and at which settings. No account required.',
  },
];

export const HowItWorks = (): ReactElement => {
  return (
    <section
      className="py-16 border-t border-white/[0.06] border-b"
      aria-labelledby="how-it-works-heading"
    >
      <div className="text-center mb-12">
        <h2
          className="text-3xl font-bold text-white m-0 mb-2"
          id="how-it-works-heading"
        >
          How It Works
        </h2>
        <p className="text-base text-gray-400 m-0">
          Three steps to know if your PC is ready to play.
        </p>
      </div>

      <ol
        className="list-none p-0 m-0 grid grid-cols-1 md:grid-cols-3 gap-8"
        aria-label="Steps to check game compatibility"
      >
        {STEPS.map((step) => (
          <li
            key={step.number}
            className="relative bg-[#161b22] border border-white/[0.06] rounded-2xl pt-8 px-6 pb-6 text-center transition-colors duration-200 hover:border-blue-500/40"
          >
            <div
              className="w-14 h-14 rounded-full bg-blue-500/[0.12] flex items-center justify-center mx-auto mb-4 text-blue-500"
              aria-hidden="true"
            >
              {step.icon}
            </div>
            <div
              className="absolute top-3 right-3 w-6 h-6 rounded-full bg-blue-500 text-white text-[0.7rem] font-bold flex items-center justify-center"
              aria-hidden="true"
            >
              {step.number}
            </div>
            <h3 className="text-lg font-semibold text-white m-0 mb-2">
              {step.title}
            </h3>
            <p className="text-sm text-gray-400 m-0 leading-relaxed">
              {step.description}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
};
