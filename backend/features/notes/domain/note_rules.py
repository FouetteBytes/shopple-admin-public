"""
Note Domain Rules.
"""

class NoteRules:
    @staticmethod
    def validate_title(title: str) -> bool:
        return bool(title and title.strip())
