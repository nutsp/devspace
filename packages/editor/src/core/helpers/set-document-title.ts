import * as Y from "yjs";

/** Update the shared title without replacing the document body or collaboration history. */
export function setDocumentTitle(document: Y.Doc, value: string) {
  document.transact(() => {
    const fragment = document.getXmlFragment("title");
    const heading = new Y.XmlElement("heading");
    heading.setAttribute("level", "1");
    const text = new Y.XmlText();
    text.insert(0, value);
    heading.insert(0, [text]);
    fragment.delete(0, fragment.length);
    fragment.insert(0, [heading]);
  });
}
