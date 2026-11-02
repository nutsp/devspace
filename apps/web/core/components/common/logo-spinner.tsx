/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { DevspaceMark } from "@plane/ui";

export function LogoSpinner() {
  return (
    <div className="flex items-center justify-center" role="status" aria-label="Loading DevSpace">
      <DevspaceMark className="size-6 animate-pulse motion-reduce:animate-none sm:size-11" aria-hidden="true" />
    </div>
  );
}
