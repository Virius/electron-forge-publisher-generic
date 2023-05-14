import { PublisherBase, PublisherOptions } from '@electron-forge/publisher-base';
import FormData from 'form-data';
import fs from 'fs';
import fsPromises from 'fs/promises';
import yaml from 'js-yaml';
import fetch from 'node-fetch';
import { ForgePlatform } from '@electron-forge/shared-types';

interface PublisherGenericConfig {
    /**
     * Base url (with https?://) of your instance of generic update server
     */
    baseUrl: string;
    /**
     * Authentication token in generic update server
     */
    token: string;
}

type OsType = 'win' | 'linux' | 'mac' | string;

interface PlatformToOsMap {
    [name: ForgePlatform]: OsType;
}

const platformToOsMap: PlatformToOsMap = {
    linux: 'linux',
    win32: 'win',
    darwin: 'mac',
};

interface OsArtifacts {
    [name: OsType]: {
        files: string[];
        metaFiles: string[];
    };
}

const LATEST_YAML_FILEPATH = 'latest.yml';

class PublisherGeneric extends PublisherBase<PublisherGenericConfig> {
    name = 'generic';

    async publish({ makeResults, setStatusLine }: PublisherOptions): Promise<void> {
        const collapsedResults = this.collapseMakeResults(makeResults);
        const osCount = Object.keys(collapsedResults).length;

        for (const [os, artifacts] of Object.entries(collapsedResults)) {
            const msg = `Uploading result (${os}/${osCount})`;
            setStatusLine(msg);
            for (const artifactPath of artifacts.files) {
                await this.uploadFile(artifactPath, os);
            }
            if (artifacts.metaFiles.length > 0) {
                let metaObj = {};
                for (const artifactPath of artifacts.metaFiles) {
                    Object.assign(metaObj, await this.loadYamlFileToObj(artifactPath));
                }
                await this.uploadFile(LATEST_YAML_FILEPATH, os, this.objToYamlString(metaObj));
            }
        }
    }

    private collapseMakeResults = (makeResults: PublisherOptions['makeResults']): OsArtifacts => {
        const newMakeResults: OsArtifacts = {};
        for (const makeResult of makeResults) {
            const os = platformToOsMap[makeResult.platform];
            if (!newMakeResults[os])
                newMakeResults[os] = {
                    files: [],
                    metaFiles: [],
                };
            makeResult.artifacts.forEach((artifact) => {
                if (artifact && artifact.match(/latest-.*\.yml/)) {
                    newMakeResults[os].metaFiles.push(artifact);
                } else if (!newMakeResults[os].files.includes(artifact)) {
                    newMakeResults[os].files.push(artifact);
                }
            });
        }
        return newMakeResults;
    };

    private uploadFile = async (artifactPath: string, os: OsType, fileContent?: string): Promise<void> => {
        const { config } = this;
        console.log(` upload file ${artifactPath}`);
        const data = new FormData();
        if (fileContent) {
            data.append(`File`, fileContent, artifactPath);
        } else {
            data.append(`File`, fs.createReadStream(artifactPath));
        }
        const response = await fetch(`${config.baseUrl}/${os}/upload`, {
            headers: {
                Authorization: config.token,
            },
            method: 'POST',
            body: data,
        });

        if (response.status !== 200) {
            throw new Error(
                `Unexpected response code from Generic server: ` +
                    `${response.status}\n\nBody:\n${await response.text()}`
            );
        }
    };

    private loadYamlFileToObj = async (filePath: string): Promise<unknown> => {
        return yaml.load(await fsPromises.readFile(filePath, 'utf8'));
    };

    private objToYamlString = (obj: unknown): string => {
        return yaml.dump(obj, {
            lineWidth: 8000,
            skipInvalid: false,
            noRefs: false,
        });
    };
}

export default PublisherGeneric;
