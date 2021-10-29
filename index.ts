import PublisherBase, { PublisherOptions } from '@electron-forge/publisher-base';
import { asyncOra } from '@electron-forge/async-ora';
import FormData from 'form-data';
import fs from 'fs';
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
    [name: OsType]: string[];
}

class PublisherGeneric extends PublisherBase<PublisherGenericConfig> {
    name = 'generic';

    private collapseMakeResults = (makeResults: PublisherOptions['makeResults']): OsArtifacts => {
        const newMakeResults: OsArtifacts = {};
        for (const makeResult of makeResults) {
            const os = platformToOsMap[makeResult.platform];
            if (!newMakeResults[os]) newMakeResults[os] = [];
            makeResult.artifacts.forEach((artifact) => {
                if (!newMakeResults[os].includes(artifact)) newMakeResults[os].push(artifact);
            });
        }
        return newMakeResults;
    };

    async publish({ makeResults }: PublisherOptions): Promise<void> {
        const { config } = this;
        const collapsedResults = this.collapseMakeResults(makeResults);
        const osCount = Object.keys(collapsedResults).length;

        for (const [os, artifacts] of Object.entries(collapsedResults)) {
            const msg = `Uploading result (${os}/${osCount})`;

            await asyncOra(msg, async () => {
                for (const artifactPath of artifacts) {
                    console.log(` upload file ${artifactPath}`);
                    const data = new FormData();
                    data.append(`File`, fs.createReadStream(artifactPath));
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
                }
            });
        }
    }
}

export default PublisherGeneric;
