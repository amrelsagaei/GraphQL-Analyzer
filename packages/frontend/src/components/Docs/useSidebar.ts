import { ref } from "vue";

type Section = {
  id: string;
  title: string;
};

export const useSidebar = () => {
  const sections: Section[] = [
    { id: "getting-started", title: "Getting Started" },
    { id: "graphql-view-mode", title: "GraphQL View Mode" },
    { id: "schema-discovery", title: "Schema Discovery" },
    { id: "schema-visualization", title: "Schema Visualization" },
    { id: "security-testing", title: "Security Testing" },
    { id: "attack-results", title: "Attack Results" },
    { id: "advanced-features", title: "Advanced Features" },
  ];

  const activeSection = ref<string>(sections[0]?.id ?? "");

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element !== null) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return {
    sections,
    activeSection,
    scrollToSection,
  };
};
