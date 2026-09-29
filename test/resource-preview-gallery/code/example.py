from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class PreviewResource:
    path: Path
    start_line: int | None = None
    end_line: int | None = None

    @property
    def label(self) -> str:
        if self.start_line is None:
            return self.path.name
        suffix = f"{self.start_line}"
        if self.end_line and self.end_line > self.start_line:
            suffix += f"-{self.end_line}"
        return f"{self.path.name}:{suffix}"


resource = PreviewResource(Path("ExamplePanel.tsx"), 12, 26)
print(resource.label)
