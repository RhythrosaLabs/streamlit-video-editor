from setuptools import setup, find_packages

setup(
    name="streamlit-nle",
    version="0.1.1",
    author="Dan Sheils",
    author_email="",
    description="Non-linear video editor component for Streamlit with multi-track timeline",
    long_description=open("README.md").read(),
    long_description_content_type="text/markdown",
    url="https://github.com/RhythrosaLabs/streamlit-video-editor",
    project_urls={
        "Bug Tracker": "https://github.com/RhythrosaLabs/streamlit-video-editor/issues",
        "Changelog": "https://github.com/RhythrosaLabs/streamlit-video-editor/blob/main/CHANGELOG.md",
    },
    packages=find_packages(),
    include_package_data=True,
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
    ],
    python_requires=">=3.8",
    install_requires=["streamlit>=1.28.0"],
)
