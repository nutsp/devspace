BUILTIN_TEMPLATES = {
    "prd": ("PRD", ["Problem and context", "Goals and success metrics", "Users and use cases", "Requirements", "Out of scope", "Acceptance criteria", "Dependencies and risks", "Open questions"]),
    "technical-design": ("Technical Design", ["Context and requirements", "Proposed architecture", "Data model", "API contracts", "Security and permissions", "Alternatives considered", "Testing strategy", "Rollout and rollback", "Open questions"]),
    "adr": ("ADR", ["Status", "Context", "Decision", "Alternatives considered", "Consequences", "References"]),
    "runbook": ("Runbook", ["Purpose and scope", "Prerequisites and access", "Health checks", "Procedure", "Verification", "Troubleshooting", "Rollback", "Escalation and contacts"]),
}


def builtin_html(headings):
    return "".join(f"<h2>{heading}</h2><p></p>" for heading in headings)
