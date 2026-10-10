from rajkot_bake.chowks import _subject, chowk_name


def test_chowk_name_extracted_from_business_names():
    assert chowk_name("Medkart Pharmacy Moti Tanki Chowk") == "Moti Tanki Chowk"
    assert chowk_name("Malaviya Chowk,rajkot") == "Malaviya Chowk"
    assert chowk_name("J K Chowk") == "J K Chowk"
    assert chowk_name("Bhaktinagar Circle") == "Bhaktinagar Circle"
    assert chowk_name("Aavas Financiers - Home Loan") is None


def test_statue_subjects():
    assert _subject("Indira Gandhi Statue") == "indira"
    assert _subject("Mahatma Gandhi Statue") == "gandhi"
    assert _subject("21 Feet Suta Hanumanji Statue") == "hanuman"
