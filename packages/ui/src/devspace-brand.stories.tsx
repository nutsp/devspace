import type { Meta, StoryObj } from "@storybook/react";
import { DevspaceLogo, DevspaceMark } from "./devspace-brand";

const meta: Meta<typeof DevspaceLogo> = {
  title: "Brand/Devspace",
  component: DevspaceLogo,
};
export default meta;
type Story = StoryObj<typeof DevspaceLogo>;

export const Wordmark: Story = { args: { className: "text-20" } };
export const Marks: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      {[16, 32, 72].map((size) => (
        <DevspaceMark key={size} width={size} height={size} />
      ))}
    </div>
  ),
};
